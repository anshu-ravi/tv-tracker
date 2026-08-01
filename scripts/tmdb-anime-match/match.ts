#!/usr/bin/env -S npx tsx
// TMDB <-> AniList anime matcher for tv-tracker.
//
//   npx tsx scripts/tmdb-anime-match/match.ts             # dry run (default, writes nothing)
//   npx tsx scripts/tmdb-anime-match/match.ts --dry-run    # same, explicit
//   npx tsx scripts/tmdb-anime-match/match.ts --execute     # writes tmdb_match_* + enriched episode fields
//
// See README.md in this directory for the matching rules and required env vars.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env";
import { getAnimeInfo } from "./lib/anilist";
import { resolveAnimeTmdbMatch, applyTmdbAnimeMatch, type AnimeMatchResult } from "./lib/matcher";

interface TrackedAnimeRow {
  title_id: string;
  titles: {
    id: string;
    source_id: string;
    title: string;
    tmdb_match_id: number | null;
    tmdb_match_checked_at: string | null;
  } | null;
}

interface ExistingEpisodeRow {
  absolute_number: number | null;
  name: string | null;
  overview: string | null;
  still_url: string | null;
  runtime: number | null;
}

// Counts how many episodes a match WOULD update, and how many fields, using
// the exact same precedence rules as lib/matcher.ts's applyTmdbAnimeMatch
// (only fill fields currently null; name is existing > Jikan > TMDB). Pure —
// used to report projected gains without writing in dry-run mode.
function projectGains(
  result: AnimeMatchResult,
  existingEpisodes: ExistingEpisodeRow[],
): { episodes: number; overview: number; stillUrl: number; runtime: number; name: number } {
  if (!result.matched) return { episodes: 0, overview: 0, stillUrl: 0, runtime: 0, name: 0 };
  let episodes = 0;
  let overview = 0;
  let stillUrl = 0;
  let runtime = 0;
  let name = 0;
  for (const row of existingEpisodes) {
    if (row.absolute_number == null) continue;
    const tmdbEp = result.episodeData.get(row.absolute_number);
    if (!tmdbEp) continue;
    let changed = false;
    if (tmdbEp.overview && !row.overview) {
      overview++;
      changed = true;
    }
    if (tmdbEp.stillUrl && !row.still_url) {
      stillUrl++;
      changed = true;
    }
    if (tmdbEp.runtime && !row.runtime) {
      runtime++;
      changed = true;
    }
    if (tmdbEp.name && !row.name) {
      name++;
      changed = true;
    }
    if (changed) episodes++;
  }
  return { episodes, overview, stillUrl, runtime, name };
}

function pad(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len - 1) + "…" : s.padEnd(len);
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const mode = execute ? "execute" : "dry-run";

  console.log(`TMDB anime match tool — mode: ${mode}\n`);

  const env = loadEnv();
  // Service role key bypasses RLS — same justification as
  // scripts/refresh-catalog/refresh.ts and trakt-import: a one-off offline
  // tool, never deployed, never run from the browser.
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("user_titles")
    .select("title_id, titles(id, source_id, title, tmdb_match_id, tmdb_match_checked_at)")
    .eq("user_id", env.TARGET_USER_ID)
    .eq("titles.source", "anilist");

  if (error) {
    console.error("Failed to load tracked anime titles:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as unknown as TrackedAnimeRow[];
  // Supabase's embedded-table filter (`.eq("titles.source", ...)`) can still
  // return rows with a null `titles` if the join didn't match — filter again
  // client-side to be safe, and dedupe (a title could theoretically appear
  // under more than one list join in a future schema change).
  const seen = new Set<string>();
  const titles = rows
    .map((r) => r.titles)
    .filter((t): t is NonNullable<TrackedAnimeRow["titles"]> => t !== null)
    .filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));

  console.log(`Found ${titles.length} tracked AniList title(s).\n`);

  const strategyCounts = { whole: 0, season: 0, group: 0 };
  const skipReasons = new Map<string, number>();
  let totalEpisodeGains = 0;
  let totalOverviewGains = 0;
  let totalStillGains = 0;
  let totalRuntimeGains = 0;

  const header = `${pad("AniList Title", 34)} ${pad("TMDB Match", 30)} ${pad("Strategy", 8)} ${pad("Eps AL/TMDB", 11)} ${pad("Δdays", 6)} ${"Result"}`;
  console.log(header);
  console.log("-".repeat(header.length));

  for (const t of titles) {
    try {
      const anime = await getAnimeInfo(t.source_id);

      const { data: ep1 } = await supabase
        .from("episodes")
        .select("air_date")
        .eq("title_id", t.id)
        .eq("season_number", 1)
        .eq("absolute_number", 1)
        .maybeSingle();
      const anilistEp1AirDate = (ep1 as { air_date: string | null } | null)?.air_date ?? anime.firstAirDate;

      const result = await resolveAnimeTmdbMatch(env.TMDB_API_KEY, {
        anilistTitleEnglish: anime.titleEnglish,
        anilistTitleRomaji: anime.titleRomaji,
        anilistTotalEpisodes: anime.totalEpisodes,
        anilistEp1AirDate,
      });

      const { data: existingEpisodes } = await supabase
        .from("episodes")
        .select("absolute_number, name, overview, still_url, runtime")
        .eq("title_id", t.id)
        .eq("season_number", 1);
      const gains = projectGains(result, (existingEpisodes ?? []) as ExistingEpisodeRow[]);

      const alCount = anime.totalEpisodes ?? "?";
      const tmdbMatchName = result.matched ? result.tmdbName : (result.triedTmdbName ?? "—");
      const strategy = result.matched ? result.strategy : "—";
      const tmdbCount = result.matched ? result.tmdbEpisodeCount : "—";
      const delta = result.matched ? String(result.airDateDeltaDays) : "—";
      const outcome = result.matched
        ? `MATCH  (+${gains.episodes} ep: ${gains.overview} overview, ${gains.stillUrl} still, ${gains.runtime} runtime, ${gains.name} name)`
        : `SKIP   (${result.reason})`;

      console.log(
        `${pad(t.title, 34)} ${pad(tmdbMatchName, 30)} ${pad(String(strategy), 8)} ${pad(`${alCount}/${tmdbCount}`, 11)} ${pad(delta, 6)} ${outcome}`,
      );

      if (result.matched) {
        strategyCounts[result.strategy]++;
        totalEpisodeGains += gains.episodes;
        totalOverviewGains += gains.overview;
        totalStillGains += gains.stillUrl;
        totalRuntimeGains += gains.runtime;
      } else {
        skipReasons.set(result.reason, (skipReasons.get(result.reason) ?? 0) + 1);
      }

      if (execute) {
        await applyTmdbAnimeMatch(supabase, t.id, result);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`${pad(t.title, 34)} ${pad("—", 30)} ${pad("—", 8)} ${pad("—", 11)} ${pad("—", 6)} ERROR  (${msg})`);
      skipReasons.set(`error: ${msg}`, (skipReasons.get(`error: ${msg}`) ?? 0) + 1);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Matched — whole:  ${strategyCounts.whole}`);
  console.log(`Matched — season: ${strategyCounts.season}`);
  console.log(`Matched — group:  ${strategyCounts.group}`);
  const totalMatched = strategyCounts.whole + strategyCounts.season + strategyCounts.group;
  console.log(`Matched total:    ${totalMatched}`);
  console.log(`Skipped total:    ${titles.length - totalMatched}`);
  for (const [reason, count] of skipReasons) {
    console.log(`  - ${reason}: ${count}`);
  }
  console.log(`\nProjected episode gains (dry run = would-write, execute = written):`);
  console.log(`  Episodes touched: ${totalEpisodeGains}`);
  console.log(`  overview:         ${totalOverviewGains}`);
  console.log(`  still_url:        ${totalStillGains}`);
  console.log(`  runtime:          ${totalRuntimeGains}`);

  if (!execute) {
    console.log(`\nDry run only — no database writes were made.`);
    console.log(`Re-run with --execute once you've reviewed the table above.`);
  } else {
    console.log(`\nDone — tmdb_match_* columns and matched episode fields were written.`);
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
