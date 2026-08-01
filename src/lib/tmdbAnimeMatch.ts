import "server-only";
import {
  searchTvForAnimeMatch,
  getTvShowSummary,
  getTvSeasonEpisodesDetail,
  getTvEpisodeGroups,
  getEpisodeGroupEpisodes,
  type TmdbEpisodeDetail,
  type TmdbShowSummary,
} from "@/lib/tmdb";

// Enriches AniList-sourced anime episodes (overview/still/runtime, and name
// as a last resort) from TMDB. AniList stays the system of record — this
// never changes a title's identity (source/sourceId) or its absolute
// numbering, it only resolves *which* TMDB show corresponds to an AniList
// entry and maps absolute_number -> TMDB (season, episode) so the existing
// `episodes` rows can be filled in.
//
// Why this is careful: an episode-count match alone is not enough evidence —
// plenty of unrelated shows share an episode count. Every strategy below is
// also required to pass an air-date check on absolute episode #1 before a
// match is accepted. Wrong descriptions silently attached to the wrong
// episodes are worse than no descriptions, so failure always means "skip and
// record the attempt", never "guess".

export type TmdbMatchStrategy = "whole" | "season" | "group";

// Match must land within this many days of AniList's air date for absolute
// #1 to be accepted — loose enough to absorb regional day-of-week release
// differences, tight enough to reject a same-episode-count coincidence.
const AIR_DATE_TOLERANCE_DAYS = 7;

// How many TMDB search candidates (across the English + romaji queries,
// deduped) to actually test strategies against. TMDB search is relevance-
// ranked, so the right show is almost always in the first couple of results;
// this just bounds worst-case API calls for a bad title match.
const MAX_CANDIDATES = 5;

export interface AnimeMatchContext {
  anilistTitleEnglish: string | null;
  anilistTitleRomaji: string | null;
  anilistTotalEpisodes: number | null;
  // AniList's air date for absolute episode #1 — prefer the already-written
  // `episodes` row (absolute_number = 1) if one exists, else AniList's
  // firstAirDate. Passed in by the caller since reading the DB is its job,
  // not this module's.
  anilistEp1AirDate: string | null;
}

export interface AnimeEpisodeData {
  name: string | null;
  overview: string | null;
  stillUrl: string | null;
  runtime: number | null;
}

export interface AnimeMatchSuccess {
  matched: true;
  tmdbId: number;
  tmdbName: string;
  strategy: TmdbMatchStrategy;
  season: number | null; // set only for the "season" strategy
  // absolute_number -> episode data ready to write.
  episodeData: Map<number, AnimeEpisodeData>;
  airDateDeltaDays: number;
  anilistEpisodeCount: number;
  tmdbEpisodeCount: number;
}

export interface AnimeMatchFailure {
  matched: false;
  reason: string;
  // Best candidate considered, for reporting even on failure (may be absent
  // if the search itself returned nothing).
  triedTmdbId: number | null;
  triedTmdbName: string | null;
}

export type AnimeMatchResult = AnimeMatchSuccess | AnimeMatchFailure;

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs(Math.round((da - db) / 86_400_000));
}

// The air-date check absolute #1 must pass, for whichever strategy proposes
// it. Returns the delta in days on success, or null when either side is
// missing (AniList date missing, or the mapped TMDB episode has no air
// date) — in which case the match is UNVERIFIED and must be rejected, not
// assumed fine.
function checkEp1AirDate(
  ctx: AnimeMatchContext,
  ep1: TmdbEpisodeDetail | undefined,
): number | null {
  if (!ctx.anilistEp1AirDate || !ep1?.airDate) return null;
  const delta = daysBetween(ctx.anilistEp1AirDate, ep1.airDate);
  return delta <= AIR_DATE_TOLERANCE_DAYS ? delta : null;
}

function buildMapping(episodes: TmdbEpisodeDetail[]): Map<number, AnimeEpisodeData> {
  const map = new Map<number, AnimeEpisodeData>();
  episodes.forEach((e, i) => {
    map.set(i + 1, { name: e.name, overview: e.overview, stillUrl: e.stillUrl, runtime: e.runtime });
  });
  return map;
}

// Strategy 1: TMDB's total episode count across real seasons (specials
// excluded) equals AniList's. Flatten seasons ascending, episodes ascending.
async function tryWholeStrategy(
  tmdbId: string,
  summary: TmdbShowSummary,
  ctx: AnimeMatchContext,
  anilistTotal: number,
): Promise<{ episodes: TmdbEpisodeDetail[]; delta: number } | null> {
  if (summary.totalEpisodes !== anilistTotal) return null;

  const seasons = summary.seasons.slice().sort((a, b) => a.seasonNumber - b.seasonNumber);
  const episodes: TmdbEpisodeDetail[] = [];
  for (const s of seasons) {
    episodes.push(...(await getTvSeasonEpisodesDetail(tmdbId, s.seasonNumber)));
  }
  const delta = checkEp1AirDate(ctx, episodes[0]);
  if (delta === null) return null;
  return { episodes, delta };
}

// Strategy 2: one individual TMDB season's episode_count equals AniList's —
// covers per-cour AniList entries (e.g. AniList "Attack on Titan Season 3"
// vs one TMDB show carrying all seasons under a single id).
async function trySeasonStrategy(
  tmdbId: string,
  summary: TmdbShowSummary,
  ctx: AnimeMatchContext,
  anilistTotal: number,
): Promise<{ episodes: TmdbEpisodeDetail[]; season: number; delta: number } | null> {
  const candidateSeasons = summary.seasons.filter((s) => s.episodeCount === anilistTotal);
  for (const s of candidateSeasons) {
    const episodes = await getTvSeasonEpisodesDetail(tmdbId, s.seasonNumber);
    const delta = checkEp1AirDate(ctx, episodes[0]);
    if (delta !== null) return { episodes, season: s.seasonNumber, delta };
  }
  return null;
}

// Strategy 3: a TMDB episode group of type 2 ("Absolute") whose episode
// count matches AniList's — TMDB's own curated absolute ordering.
async function tryGroupStrategy(
  tmdbId: string,
  ctx: AnimeMatchContext,
  anilistTotal: number,
): Promise<{ episodes: TmdbEpisodeDetail[]; delta: number } | null> {
  const groups = await getTvEpisodeGroups(tmdbId);
  const candidates = groups.filter((g) => g.type === 2 && g.episodeCount === anilistTotal);
  for (const g of candidates) {
    const episodes = await getEpisodeGroupEpisodes(g.id);
    const delta = checkEp1AirDate(ctx, episodes[0]);
    if (delta !== null) return { episodes, delta };
  }
  return null;
}

async function searchCandidates(ctx: AnimeMatchContext) {
  const seen = new Map<number, { id: number; name: string }>();
  for (const query of [ctx.anilistTitleEnglish, ctx.anilistTitleRomaji]) {
    if (!query?.trim()) continue;
    const results = await searchTvForAnimeMatch(query);
    for (const r of results) {
      if (!seen.has(r.id)) seen.set(r.id, { id: r.id, name: r.name });
    }
    if (seen.size >= MAX_CANDIDATES) break;
  }
  return Array.from(seen.values()).slice(0, MAX_CANDIDATES);
}

// Resolves an AniList anime to a TMDB show and builds an absolute_number ->
// episode-data mapping, or reports why it couldn't. Pure (no DB access) —
// the caller is responsible for reading the existing episodes.absolute_number
// = 1 air date for ctx.anilistEp1AirDate and for persisting the result.
export async function resolveAnimeTmdbMatch(ctx: AnimeMatchContext): Promise<AnimeMatchResult> {
  const anilistTotal = ctx.anilistTotalEpisodes;
  if (!anilistTotal || anilistTotal <= 0) {
    return { matched: false, reason: "AniList has no known total episode count", triedTmdbId: null, triedTmdbName: null };
  }

  const candidates = await searchCandidates(ctx);
  if (candidates.length === 0) {
    return { matched: false, reason: "TMDB search returned no candidates", triedTmdbId: null, triedTmdbName: null };
  }

  let lastTried: { id: number; name: string } | null = null;
  for (const candidate of candidates) {
    lastTried = candidate;
    const summary = await getTvShowSummary(String(candidate.id));

    const whole = await tryWholeStrategy(String(candidate.id), summary, ctx, anilistTotal);
    if (whole) {
      return {
        matched: true,
        tmdbId: candidate.id,
        tmdbName: candidate.name,
        strategy: "whole",
        season: null,
        episodeData: buildMapping(whole.episodes),
        airDateDeltaDays: whole.delta,
        anilistEpisodeCount: anilistTotal,
        tmdbEpisodeCount: whole.episodes.length,
      };
    }

    const season = await trySeasonStrategy(String(candidate.id), summary, ctx, anilistTotal);
    if (season) {
      return {
        matched: true,
        tmdbId: candidate.id,
        tmdbName: candidate.name,
        strategy: "season",
        season: season.season,
        episodeData: buildMapping(season.episodes),
        airDateDeltaDays: season.delta,
        anilistEpisodeCount: anilistTotal,
        tmdbEpisodeCount: season.episodes.length,
      };
    }

    const group = await tryGroupStrategy(String(candidate.id), ctx, anilistTotal);
    if (group) {
      return {
        matched: true,
        tmdbId: candidate.id,
        tmdbName: candidate.name,
        strategy: "group",
        season: null,
        episodeData: buildMapping(group.episodes),
        airDateDeltaDays: group.delta,
        anilistEpisodeCount: anilistTotal,
        tmdbEpisodeCount: group.episodes.length,
      };
    }
  }

  return {
    matched: false,
    reason: "no strategy (whole/season/group) passed both the episode-count and air-date checks",
    triedTmdbId: lastTried?.id ?? null,
    triedTmdbName: lastTried?.name ?? null,
  };
}

// ---- write path ---------------------------------------------------------

// The Supabase client is untyped in this codebase (see lib/api/catalog.ts) —
// match that pattern here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

interface ExistingEpisodeRow {
  id: string;
  absolute_number: number | null;
  name: string | null;
  overview: string | null;
  still_url: string | null;
  runtime: number | null;
}

// Persists a resolved (or failed) match onto `titles`, and — only when
// matched — fills in `overview`/`still_url`/`runtime`/`name` on the existing
// `episodes` rows for this title, matched on (title_id, absolute_number).
// Every write is a targeted UPDATE by row id; nothing is ever inserted,
// deleted, or overwritten from non-null to null. Best-effort: any DB error
// is logged and swallowed by the caller (see catalog.ts), never thrown here
// past what the caller can catch.
export async function applyTmdbAnimeMatch(
  supabase: SupabaseClient,
  titleId: string,
  result: AnimeMatchResult,
): Promise<{ episodesUpdated: number }> {
  const checkedAt = new Date().toISOString();

  await supabase
    .from("titles")
    .update({
      tmdb_match_id: result.matched ? result.tmdbId : null,
      tmdb_match_strategy: result.matched ? result.strategy : null,
      tmdb_match_season: result.matched ? result.season : null,
      tmdb_match_checked_at: checkedAt,
    })
    .eq("id", titleId);

  if (!result.matched) return { episodesUpdated: 0 };

  const { data, error } = await supabase
    .from("episodes")
    .select("id, absolute_number, name, overview, still_url, runtime")
    .eq("title_id", titleId)
    .eq("season_number", 1); // anime is always tracked as season 1

  if (error || !data) {
    console.error("TMDB anime match: failed to load episodes for", titleId, error);
    return { episodesUpdated: 0 };
  }

  let episodesUpdated = 0;
  for (const row of data as ExistingEpisodeRow[]) {
    if (row.absolute_number == null) continue;
    const tmdbEp = result.episodeData.get(row.absolute_number);
    if (!tmdbEp) continue;

    const patch: Record<string, string | number> = {};
    if (tmdbEp.overview && !row.overview) patch.overview = tmdbEp.overview;
    if (tmdbEp.stillUrl && !row.still_url) patch.still_url = tmdbEp.stillUrl;
    if (tmdbEp.runtime && !row.runtime) patch.runtime = tmdbEp.runtime;
    // name precedence is existing > Jikan > TMDB — only fill if still null.
    if (tmdbEp.name && !row.name) patch.name = tmdbEp.name;

    if (Object.keys(patch).length === 0) continue;

    const { error: updateError } = await supabase.from("episodes").update(patch).eq("id", row.id);
    if (updateError) {
      console.error("TMDB anime match: failed to update episode", row.id, updateError);
      continue;
    }
    episodesUpdated++;
  }

  return { episodesUpdated };
}
