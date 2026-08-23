#!/usr/bin/env -S npx tsx
// Anime -> TMDB identity migration for tv-tracker.
//
//   npx tsx scripts/anime-tmdb-migration/migrate.ts                    # dry run (default, writes NOTHING)
//   npx tsx scripts/anime-tmdb-migration/migrate.ts --pin <titleId>=<tmdbId>[:<season>]
//   npx tsx scripts/anime-tmdb-migration/migrate.ts --execute          # migrates all READY titles
//   npx tsx scripts/anime-tmdb-migration/migrate.ts --verify           # global + per-title checks only
//
// See README.md in this directory for the full design, the matching rules,
// and exactly how per-title transactionality is achieved (short version:
// each title's mutation is ONE call to the migrate_anime_title_to_tmdb()
// Postgres function — supabase/migrations/20260801150000_anime_tmdb_migration_function.sql
// — which runs the temp-renumber + final write + title-row update as a
// single atomic function body).

import { loadEnv } from "./lib/env";
import { getAnimeInfo } from "./lib/anilist";
import { getTvShowDetails, getTvShowSummary, getTvSeasonEpisodesDetail } from "./lib/tmdb";
import {
  resolveAnimeTmdbMapping,
  buildPinnedSeasonMapping,
  buildPinnedWholeMapping,
  type AnimeMatchResult,
  type MappedEpisode,
} from "./lib/matcher";
import {
  createSupabase,
  loadAnimeTitles,
  loadEpisodes,
  findCollision,
  countWatchedEpisodes,
  countOrphanedWatchedEpisodes,
  backupBeforeExecute,
  migrateTitleRpc,
  mappedEpisodeToPayload,
  checkTitleReferences,
  deleteOrphanTitle,
  type AnimeTitleRow,
  type ExistingEpisodeRow,
} from "./lib/db";

// ---------------------------------------------------------------------------
// Small formatting helpers
// ---------------------------------------------------------------------------

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len - 1) + "…" : s.padEnd(len);
}

// DATA-QUALITY NOTE (found while building this tool, contradicts the task's
// assumed starting state): 20 of the 30 anilist anime titles have
// `absolute_number = null` on every episode row — it was never backfilled
// for them (only 10 titles have it fully populated). Every anilist-sourced
// anime title's episodes are consistently `season_number = 1`, though, so
// `episode_number` (1..N under season 1) IS the absolute number for these
// rows in practice — it's what trakt-import/refresh-catalog actually wrote.
// This helper is the one place that fallback is applied, for MATCHING
// purposes only. It is never written back to `absolute_number` itself — the
// task's core requirement ("KEEP absolute_number unchanged") is honored
// literally: a null stays null after migration, exactly as before.
function effectiveAbsolute(e: { season_number: number; episode_number: number; absolute_number: number | null }): number | null {
  if (e.absolute_number != null) return e.absolute_number;
  return e.season_number === 1 ? e.episode_number : null;
}

// Summarizes a contiguous absolute->SxEy mapping into season-boundary lines,
// e.g. "abs 1-20 -> S1E1-E20, abs 21-41 -> S2E1-E21", for the dry-run report.
function summarizeMapping(mapping: Map<number, MappedEpisode>): string {
  const entries = Array.from(mapping.values()).sort((a, b) => a.absoluteNumber - b.absoluteNumber);
  if (entries.length === 0) return "(empty)";
  const chunks: string[] = [];
  let chunkStart = entries[0];
  let prev = entries[0];
  for (let i = 1; i <= entries.length; i++) {
    const cur = entries[i];
    const seasonBoundary = !cur || cur.seasonNumber !== prev.seasonNumber;
    if (seasonBoundary) {
      chunks.push(
        `abs ${chunkStart.absoluteNumber}-${prev.absoluteNumber} -> S${chunkStart.seasonNumber}E${chunkStart.episodeNumber}-E${prev.episodeNumber}`,
      );
      if (cur) chunkStart = cur;
    }
    if (cur) prev = cur;
  }
  return chunks.join(", ");
}

// ---------------------------------------------------------------------------
// --pin handling
// ---------------------------------------------------------------------------

interface PinSpec {
  titleId: string;
  tmdbId: number;
  season: number | null;
}

function parsePinArg(raw: string): PinSpec {
  const eq = raw.indexOf("=");
  if (eq === -1) throw new Error(`Invalid --pin value "${raw}" — expected <titleId>=<tmdbId>[:<season>]`);
  const titleId = raw.slice(0, eq).trim();
  const rest = raw.slice(eq + 1).trim();
  const colon = rest.indexOf(":");
  const tmdbId = Number(colon === -1 ? rest : rest.slice(0, colon));
  const season = colon === -1 ? null : Number(rest.slice(colon + 1));
  if (!titleId || !Number.isFinite(tmdbId)) {
    throw new Error(`Invalid --pin value "${raw}" — expected <titleId>=<tmdbId>[:<season>]`);
  }
  return { titleId, tmdbId, season };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyPin(supabase: any, apiKey: string, pin: PinSpec): Promise<void> {
  console.log(`\n--pin ${pin.titleId} = TMDB ${pin.tmdbId}${pin.season != null ? `:${pin.season}` : ""}`);

  // Validate the TMDB id exists and print show name + season structure so a
  // human can eyeball correctness before this gets written.
  const summary = await getTvShowSummary(apiKey, String(pin.tmdbId));
  const details = await getTvShowDetails(apiKey, String(pin.tmdbId));
  console.log(`  TMDB show: "${details.name}" (id ${pin.tmdbId}), first aired ${details.firstAirDate ?? "unknown"}, status ${details.releaseStatus}`);
  console.log(`  Seasons:`);
  for (const s of summary.seasons) {
    const eps = await getTvSeasonEpisodesDetail(apiKey, String(pin.tmdbId), s.seasonNumber);
    const first = eps[0]?.airDate ?? "?";
    const last = eps[eps.length - 1]?.airDate ?? "?";
    console.log(`    S${s.seasonNumber}: ${s.episodeCount} episodes, aired ${first} .. ${last}`);
  }

  if (pin.season != null) {
    const seasonExists = summary.seasons.some((s) => s.seasonNumber === pin.season);
    if (!seasonExists) throw new Error(`--pin: season ${pin.season} does not exist on TMDB show ${pin.tmdbId}`);
  }

  const { data: titleRow, error: titleErr } = await supabase
    .from("titles")
    .select("id, title, media_type, source")
    .eq("id", pin.titleId)
    .maybeSingle();
  if (titleErr || !titleRow) throw new Error(`--pin: titles row ${pin.titleId} not found (${titleErr?.message})`);
  console.log(`  Pinning onto local title: "${titleRow.title}" (${titleRow.media_type}, currently source=${titleRow.source})`);

  const strategy = pin.season != null ? "season" : "whole";
  const { error: updateErr } = await supabase
    .from("titles")
    .update({
      tmdb_match_id: pin.tmdbId,
      tmdb_match_strategy: strategy,
      tmdb_match_season: pin.season,
      tmdb_match_checked_at: new Date().toISOString(),
    })
    .eq("id", pin.titleId);
  if (updateErr) throw new Error(`--pin: failed to write tmdb_match_* columns: ${updateErr.message}`);

  console.log(`  Wrote tmdb_match_id=${pin.tmdbId} tmdb_match_strategy=${strategy} tmdb_match_season=${pin.season ?? "null"}`);
}

// ---------------------------------------------------------------------------
// Per-title mapping resolution for the dry-run / execute report
// ---------------------------------------------------------------------------

type Verdict =
  | { ready: true; mapping: Map<number, MappedEpisode>; tmdbId: number; tmdbName: string; strategy: string }
  | { ready: false; reason: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveTitleMapping(supabase: any, apiKey: string, t: AnimeTitleRow): Promise<Verdict> {
  // First, always try the live auto-matcher (whole -> season -> group, gated
  // on episode-count + air-date) — this covers the 25 titles the existing
  // matcher already resolved (and re-verifies them, since resolveAnimeTmdbMapping
  // is deterministic and cheap enough to re-run per title here).
  const anime = await getAnimeInfo(t.source_id);
  const existingEpisodes = await loadEpisodes(supabase, t.id);
  const ep1 = existingEpisodes.find((e) => effectiveAbsolute(e) === 1);
  const ctx = {
    anilistTitleEnglish: anime.titleEnglish,
    anilistTitleRomaji: anime.titleRomaji,
    anilistTotalEpisodes: anime.totalEpisodes,
    anilistEp1AirDate: ep1?.air_date ?? anime.firstAirDate,
  };

  let result: AnimeMatchResult = await resolveAnimeTmdbMapping(apiKey, ctx);

  // Checks that every local episode row's absolute number has a mapping
  // entry — i.e. the candidate mapping is a COMPLETE substitute for the
  // local rows, not just an episode-count/air-date match on the AniList
  // media entry's own (possibly partial) count. `anime.totalEpisodes` above
  // comes from the single AniList media object this title's source_id
  // points at, which for some titles (the 5 season-aggregate stragglers) is
  // only ONE cour/season's worth even though the local `episodes` table has
  // rows aggregated across the whole franchise — so an auto-match can look
  // "verified" against that one AniList entry's count while still leaving
  // most local rows uncovered. This helper is what catches that.
  function coverageGaps(mapping: Map<number, MappedEpisode>): number[] {
    return existingEpisodes
      .filter((e) => {
        const abs = effectiveAbsolute(e);
        return abs == null || !mapping.has(abs);
      })
      .map((e) => effectiveAbsolute(e))
      .filter((n): n is number => n != null);
  }

  // Falls back to a stored manual --pin whenever the auto-matcher either (a)
  // can't verify a match at all, or (b) verifies a match that doesn't cover
  // every local episode row (the season-aggregate case above) — in both
  // cases a human already eyeballed the pin via `applyPin`'s printout.
  const autoGaps = result.matched ? coverageGaps(result.mapping) : null;
  if ((!result.matched || (autoGaps && autoGaps.length > 0)) && t.tmdb_match_id != null) {
    try {
      const mapping =
        t.tmdb_match_strategy === "season" && t.tmdb_match_season != null
          ? await buildPinnedSeasonMapping(apiKey, String(t.tmdb_match_id), t.tmdb_match_season)
          : await buildPinnedWholeMapping(apiKey, String(t.tmdb_match_id));
      const details = await getTvShowDetails(apiKey, String(t.tmdb_match_id));
      result = {
        matched: true,
        tmdbId: t.tmdb_match_id,
        tmdbName: details.name,
        strategy: (t.tmdb_match_strategy ?? "whole") as "whole" | "season" | "group",
        season: t.tmdb_match_season,
        mapping,
        airDateDeltaDays: -1, // manual pin — not gated on air date
        anilistEpisodeCount: anime.totalEpisodes ?? 0,
        tmdbEpisodeCount: mapping.size,
      };
    } catch (err) {
      return { ready: false, reason: `pinned TMDB lookup failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  if (result.matched !== true) {
    return { ready: false, reason: `no TMDB match (${result.reason}) — needs a --pin` };
  }
  const matchedResult = result;

  // Every existing episode row's absolute_number must have a mapping entry,
  // or we'd be left unable to write real coordinates for it. (Re-checked
  // here even for the pinned-mapping path above — a pin is still not
  // trusted blindly to have full coverage.)
  const missing = coverageGaps(matchedResult.mapping);
  if (missing.length > 0) {
    return {
      ready: false,
      reason: `${missing.length} episode row(s) have no TMDB counterpart in the mapping (absolute ${missing.join(",")})`,
    };
  }

  const collision = await findCollision(supabase, result.tmdbId, t.id);
  if (collision) {
    return {
      ready: false,
      reason: `TMDB id ${result.tmdbId} already exists as another titles row ("${collision.title}", ${collision.media_type}, id ${collision.id}) — would violate UNIQUE(source, source_id, source_namespace)`,
    };
  }

  return { ready: true, mapping: result.mapping, tmdbId: result.tmdbId, tmdbName: result.tmdbName, strategy: result.strategy };
}

// ---------------------------------------------------------------------------
// Dry-run / execute report
// ---------------------------------------------------------------------------

interface TitleReport {
  title: AnimeTitleRow;
  verdict: Verdict;
  episodes: ExistingEpisodeRow[];
  watchedCount: number;
  gains: { episodes: number; overview: number; stillUrl: number; runtime: number; name: number; airDate: number };
}

function projectGains(episodes: ExistingEpisodeRow[], mapping: Map<number, MappedEpisode>) {
  let ep = 0,
    overview = 0,
    stillUrl = 0,
    runtime = 0,
    name = 0,
    airDate = 0;
  for (const row of episodes) {
    const abs = effectiveAbsolute(row);
    if (abs == null) continue;
    const m = mapping.get(abs);
    if (!m) continue;
    let changed = false;
    if (m.overview && !row.overview) { overview++; changed = true; }
    if (m.stillUrl && !row.still_url) { stillUrl++; changed = true; }
    if (m.runtime && !row.runtime) { runtime++; changed = true; }
    if (m.name && !row.name) { name++; changed = true; }
    if (m.airDate && !row.air_date) { airDate++; changed = true; }
    if (changed) ep++;
  }
  return { episodes: ep, overview, stillUrl, runtime, name, airDate };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildReports(supabase: any, apiKey: string, targetUserId: string, titles: AnimeTitleRow[]): Promise<TitleReport[]> {
  const reports: TitleReport[] = [];
  for (const t of titles) {
    console.log(`Resolving ${t.title}...`);
    let verdict: Verdict;
    try {
      verdict = await resolveTitleMapping(supabase, apiKey, t);
    } catch (err) {
      verdict = { ready: false, reason: `error: ${err instanceof Error ? err.message : String(err)}` };
    }
    const episodes = await loadEpisodes(supabase, t.id);
    const watchedCount = await countWatchedEpisodesForTitleAndUser(supabase, t.id, targetUserId);
    const gains = verdict.ready ? projectGains(episodes, verdict.mapping) : { episodes: 0, overview: 0, stillUrl: 0, runtime: 0, name: 0, airDate: 0 };
    reports.push({ title: t, verdict, episodes, watchedCount, gains });
  }
  return reports;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countWatchedEpisodesForTitleAndUser(supabase: any, titleId: string, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("watched_episodes")
    .select("*", { count: "exact", head: true })
    .eq("title_id", titleId)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to count watched episodes for ${titleId}: ${error.message}`);
  return count ?? 0;
}

function printReports(reports: TitleReport[]): void {
  const header = `${pad("AniList Title", 32)} ${pad("TMDB Match", 30)} ${pad("Strategy", 8)} ${pad("Watched", 8)} Verdict`;
  console.log(`\n${header}`);
  console.log("-".repeat(header.length));

  for (const r of reports) {
    const name = r.verdict.ready ? r.verdict.tmdbName : "—";
    const strategy = r.verdict.ready ? r.verdict.strategy : "—";
    const verdictText = r.verdict.ready
      ? `READY (+${r.gains.episodes} ep enriched)`
      : `BLOCKED (${(r.verdict as { reason: string }).reason})`;
    console.log(`${pad(r.title.title, 32)} ${pad(name, 30)} ${pad(strategy, 8)} ${pad(String(r.watchedCount), 8)} ${verdictText}`);

    if (r.verdict.ready) {
      console.log(`    source: (anilist, ${r.title.source_id}) -> (tmdb, ${r.verdict.tmdbId}) "${r.verdict.tmdbName}"`);
      console.log(`    mapping: ${summarizeMapping(r.verdict.mapping)}`);
      console.log(
        `    field gains: ${r.gains.overview} overview, ${r.gains.stillUrl} still, ${r.gains.runtime} runtime, ${r.gains.name} name, ${r.gains.airDate} air_date`,
      );

      // 2-3 concrete spot-check lines for watched episodes, in plain language.
      const watchedAbsolutes = r.episodes
        .filter((e) => effectiveAbsolute(e) != null)
        .slice()
        .sort(() => Math.random() - 0.5) // any 2-3 is fine; order doesn't matter for a spot check
        .slice(0, 3);
      for (const e of watchedAbsolutes) {
        const abs = effectiveAbsolute(e)!;
        const m = r.verdict.mapping.get(abs);
        if (!m) continue;
        console.log(
          `    spot-check: absolute ${abs} -> S${m.seasonNumber}E${m.episodeNumber}${m.name ? ` "${m.name}"` : ""}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// --resolve-collisions
// ---------------------------------------------------------------------------
//
// Guarded, opt-in orphan-row deletion mode. This is a REAL DELETE, unlike
// every other write path in this tool (which is UPDATE-only on rows being
// migrated). It is safe ONLY because the target rows are genuinely dead:
// zero watched_episodes, zero user_titles, zero list_titles reference them
// — verified once here for the report, then RE-verified immediately before
// the delete inside deleteOrphanTitle() itself, so a reference that appears
// between the report and the delete aborts the delete rather than silently
// destroying data. Distinct from the core in-place-UPDATE-only invariant,
// which governs titles/episodes that ARE being migrated — this function
// only ever touches rows that are not tracked by the user at all.
//
// Currently the only known case is the orphan Bleach TMDB row
// (b0950c1e-2a83-4aa3-a481-2593aee43fc4, source=tmdb id 30984, media_type
// tv, 416 episode rows, 0 watched_episodes, 0 user_titles) blocking the
// Bleach anilist row (bbb410ee-4d9f-4e0a-8065-dba47ffa556e) from taking
// TMDB id 30984. Nothing here is hardcoded to Bleach specifically — it scans
// every currently-BLOCKED anilist anime title for a same-tmdb-id collision
// and offers to resolve any that are genuinely unreferenced.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runResolveCollisions(supabase: any, apiKey: string, execute: boolean): Promise<void> {
  console.log(`\n=== --resolve-collisions (${execute ? "EXECUTE" : "dry-run"}) ===`);

  const titles = await loadAnimeTitles(supabase);
  let anyFound = false;

  for (const t of titles) {
    let verdict: Verdict;
    try {
      verdict = await resolveTitleMapping(supabase, apiKey, t);
    } catch (err) {
      verdict = { ready: false, reason: `error: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (verdict.ready) continue;
    const match = verdict.reason.match(/TMDB id (\d+) already exists as another titles row \("([^"]+)", (\w+), id ([0-9a-f-]+)\)/);
    if (!match) continue;

    anyFound = true;
    const [, tmdbIdStr, collisionTitle, collisionMediaType, collisionId] = match;
    console.log(`\nCollision: "${t.title}" (anilist ${t.source_id}) wants TMDB id ${tmdbIdStr}, held by "${collisionTitle}" (${collisionMediaType}, id ${collisionId})`);

    const refs = await checkTitleReferences(supabase, collisionId);
    console.log(
      `  Reference check on ${collisionId}: ${refs.watchedEpisodeCount} watched_episodes, ${refs.userTitlesCount} user_titles, ${refs.listTitlesCount ?? "?"} list_titles`,
    );

    const isEmpty = refs.watchedEpisodeCount === 0 && refs.userTitlesCount === 0 && (refs.listTitlesCount ?? 0) === 0;
    if (!isEmpty) {
      console.log(`  NOT genuinely orphaned — refusing to delete. Leaving "${t.title}" BLOCKED for a human decision.`);
      continue;
    }
    console.log(`  Confirmed unreferenced (untracked orphan).`);

    if (!execute) {
      console.log(`  Dry run only — would delete titles row ${collisionId} and its episode rows. Re-run with --resolve-collisions --execute to actually delete.`);
      continue;
    }

    const { episodesDeleted } = await deleteOrphanTitle(supabase, collisionId);
    console.log(`  DELETED titles row ${collisionId} ("${collisionTitle}") and ${episodesDeleted} episode row(s).`);
  }

  if (!anyFound) {
    console.log(`No BLOCKED title currently has a TMDB-id collision reason. Nothing to resolve.`);
  }
}

// ---------------------------------------------------------------------------
// --verify
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runVerify(supabase: any, titleIds?: string[]): Promise<boolean> {
  console.log(`\n=== Verify ===`);
  let pass = true;

  const totalWatched = await countWatchedEpisodes(supabase);
  const expectTotalWatched = 6149;
  const totalOk = totalWatched === expectTotalWatched;
  pass = pass && totalOk;
  console.log(`${totalOk ? "PASS" : "FAIL"}  total watched_episodes = ${totalWatched} (expected ${expectTotalWatched})`);

  const orphaned = await countOrphanedWatchedEpisodes(supabase);
  const orphanOk = orphaned === 0;
  pass = pass && orphanOk;
  console.log(`${orphanOk ? "PASS" : "FAIL"}  orphaned watched_episodes = ${orphaned} (expected 0)`);

  const { count: negativeSeasons, error: negErr } = await supabase
    .from("episodes")
    .select("*", { count: "exact", head: true })
    .lt("season_number", 0);
  if (negErr) throw new Error(`Verify: failed counting negative season_number rows: ${negErr.message}`);
  const negOk = (negativeSeasons ?? 0) === 0;
  pass = pass && negOk;
  console.log(`${negOk ? "PASS" : "FAIL"}  episodes with season_number < 0 = ${negativeSeasons} (expected 0)`);

  if (titleIds && titleIds.length > 0) {
    for (const titleId of titleIds) {
      const episodes = await loadEpisodes(supabase, titleId);
      const negRows = episodes.filter((e) => e.season_number < 0);
      // Effective absolute number (falls back to episode_number under season
      // 1 when the absolute_number column itself is null — see
      // effectiveAbsolute()'s doc comment for why that fallback is valid).
      const absNumbers = episodes
        .map((e) => effectiveAbsolute(e))
        .filter((n): n is number => n != null)
        .sort((a, b) => a - b);
      const contiguous = absNumbers.length > 0 && absNumbers.every((n, i) => n === i + 1);
      const { data: titleRow } = await supabase.from("titles").select("title").eq("id", titleId).maybeSingle();
      const label = titleRow?.title ?? titleId;

      const ok = negRows.length === 0 && contiguous;
      pass = pass && ok;
      console.log(
        `${ok ? "PASS" : "FAIL"}  ${label}: ${episodes.length} episode rows, absolute_number contiguous 1..${absNumbers.length}: ${contiguous}, negative seasons: ${negRows.length}`,
      );
    }
  }

  console.log(`\n${pass ? "VERIFY PASSED" : "VERIFY FAILED"}`);
  return pass;
}

// ---------------------------------------------------------------------------
// --execute
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runExecute(supabase: any, apiKey: string, reports: TitleReport[]): Promise<void> {
  const ready = reports.filter((r) => r.verdict.ready);
  const blocked = reports.filter((r) => !r.verdict.ready);

  for (const r of blocked) {
    console.log(`SKIP (not READY): ${r.title.title} — ${(r.verdict as { reason: string }).reason}`);
  }

  if (ready.length === 0) {
    console.log(`\nNo READY titles — nothing to execute.`);
    return;
  }

  console.log(`\nTaking backup of ${ready.length} title(s) before any mutation...`);
  const backup = await backupBeforeExecute(
    supabase,
    ready.map((r) => r.title.id),
  );
  console.log(`Backup tables: ${backup.titlesTable}, ${backup.episodesTable}`);

  let migrated = 0;
  let failed = 0;

  for (const r of ready) {
    if (!r.verdict.ready) continue;
    try {
      const details = await getTvShowDetails(apiKey, String(r.verdict.tmdbId));
      const payload = r.episodes
        .map((e) => ({ e, abs: effectiveAbsolute(e) }))
        .filter((x): x is { e: (typeof r.episodes)[number]; abs: number } => x.abs != null)
        .map(({ e, abs }) => mappedEpisodeToPayload(e.id, r.verdict.ready ? r.verdict.mapping.get(abs)! : (undefined as never)));

      const { episodesUpdated } = await migrateTitleRpc(
        supabase,
        r.title.id,
        r.verdict.tmdbId,
        {
          name: details.name,
          posterUrl: details.posterUrl,
          backdropUrl: details.backdropUrl,
          overview: details.overview,
          firstAirDate: details.firstAirDate,
          releaseStatus: details.releaseStatus,
          isRunning: details.isRunning,
          totalEpisodes: details.totalEpisodes,
          nextEpisodeAirDate: details.nextEpisodeAirDate,
          nextEpisodeLabel: details.nextEpisodeLabel,
        },
        payload,
      );
      console.log(`OK    ${r.title.title} -> TMDB ${r.verdict.tmdbId} "${r.verdict.tmdbName}" (${episodesUpdated} episode rows updated)`);
      migrated++;
    } catch (err) {
      console.log(`FAIL  ${r.title.title}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n=== Execute summary ===`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Failed:   ${failed}`);
  console.log(`Skipped (not ready): ${blocked.length}`);

  await runVerify(
    supabase,
    ready.map((r) => r.title.id),
  );
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const verifyOnly = args.includes("--verify");
  const resolveCollisions = args.includes("--resolve-collisions");
  const pinArgs = args
    .map((a, i) => (a === "--pin" ? args[i + 1] : null))
    .filter((v): v is string => v != null);

  const env = loadEnv();
  const supabase = createSupabase(env);

  if (resolveCollisions) {
    await runResolveCollisions(supabase, env.TMDB_API_KEY, execute);
    return;
  }

  if (pinArgs.length > 0) {
    for (const raw of pinArgs) {
      const pin = parsePinArg(raw);
      await applyPin(supabase, env.TMDB_API_KEY, pin);
    }
    console.log(`\n${pinArgs.length} pin(s) applied. Re-run without --pin to see the dry-run report.`);
    return;
  }

  if (verifyOnly) {
    const titles = await loadAnimeTitlesIncludingMigrated(supabase);
    await runVerify(supabase, titles.map((t) => t.id));
    return;
  }

  console.log(`Anime -> TMDB migration tool — mode: ${execute ? "EXECUTE" : "dry-run"}\n`);

  const titles = await loadAnimeTitles(supabase); // only still-anilist-sourced anime
  console.log(`Found ${titles.length} anilist-sourced anime title(s).`);

  const reports = await buildReports(supabase, env.TMDB_API_KEY, env.TARGET_USER_ID, titles);
  printReports(reports);

  const ready = reports.filter((r) => r.verdict.ready);
  const blocked = reports.filter((r) => !r.verdict.ready);
  const totalEpisodesAffected = ready.reduce((sum, r) => sum + r.episodes.length, 0);
  const totalWatchedAffected = ready.reduce((sum, r) => sum + r.watchedCount, 0);

  console.log(`\n=== Summary ===`);
  console.log(`Ready:   ${ready.length}`);
  console.log(`Blocked: ${blocked.length}`);
  for (const r of blocked) {
    console.log(`  - ${r.title.title}: ${(r.verdict as { reason: string }).reason}`);
  }
  console.log(`Episode rows affected (ready titles):  ${totalEpisodesAffected}`);
  console.log(`Watch records affected (ready titles):  ${totalWatchedAffected}`);

  if (!execute) {
    console.log(`\nDry run only — no database writes were made.`);
    console.log(`Re-run with --execute once you've reviewed the table above.`);
    return;
  }

  console.log(`\n--execute: migrating READY titles only...`);
  await runExecute(supabase, env.TMDB_API_KEY, reports);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadAnimeTitlesIncludingMigrated(supabase: any) {
  // --verify should also be runnable AFTER a migration (once a title is
  // source='tmdb'), so it looks up every media_type='anime' title this tool
  // has ever touched: still-pending anilist titles (source='anilist'), OR
  // ones this tool (or scripts/tmdb-anime-match) already resolved/migrated
  // (tmdb_match_id is not null). It deliberately does NOT include anime
  // titles that were added directly as TMDB from the start — those never
  // used absolute_number numbering, so the "contiguous 1..N absolute
  // numbers" check does not apply to them and would false-fail.
  const { data, error } = await supabase
    .from("titles")
    .select("id, title")
    .eq("media_type", "anime")
    .or("source.eq.anilist,tmdb_match_id.not.is.null");
  if (error) throw new Error(`Failed to load anime titles for verify: ${error.message}`);
  return (data ?? []) as { id: string; title: string }[];
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
