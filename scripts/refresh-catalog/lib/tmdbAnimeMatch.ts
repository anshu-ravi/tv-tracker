// Standalone mirror of src/lib/tmdbAnimeMatch.ts for this offline script —
// same reasoning as the rest of scripts/refresh-catalog/lib: no server-only
// import, apiKey passed explicitly. See the app version for the full
// rationale (AniList has no per-episode synopsis; TMDB enriches it; every
// strategy requires BOTH an episode-count match AND an air-date check on
// absolute #1 before being accepted — an episode-count match alone is not
// sufficient evidence).

import {
  searchTvForAnimeMatch,
  getTvShowSummary,
  getTvSeasonEpisodesDetail,
  getTvEpisodeGroups,
  getEpisodeGroupEpisodes,
  type TmdbEpisodeDetail,
  type TmdbShowSummary,
} from "./tmdb";

export type TmdbMatchStrategy = "whole" | "season" | "group";

const AIR_DATE_TOLERANCE_DAYS = 7;
const MAX_CANDIDATES = 5;

export interface AnimeMatchContext {
  anilistTitleEnglish: string | null;
  anilistTitleRomaji: string | null;
  anilistTotalEpisodes: number | null;
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
  season: number | null;
  episodeData: Map<number, AnimeEpisodeData>;
  airDateDeltaDays: number;
  anilistEpisodeCount: number;
  tmdbEpisodeCount: number;
}

export interface AnimeMatchFailure {
  matched: false;
  reason: string;
  triedTmdbId: number | null;
  triedTmdbName: string | null;
}

export type AnimeMatchResult = AnimeMatchSuccess | AnimeMatchFailure;

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs(Math.round((da - db) / 86_400_000));
}

function checkEp1AirDate(ctx: AnimeMatchContext, ep1: TmdbEpisodeDetail | undefined): number | null {
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

async function tryWholeStrategy(
  apiKey: string,
  tmdbId: string,
  summary: TmdbShowSummary,
  ctx: AnimeMatchContext,
  anilistTotal: number,
): Promise<{ episodes: TmdbEpisodeDetail[]; delta: number } | null> {
  if (summary.totalEpisodes !== anilistTotal) return null;
  const seasons = summary.seasons.slice().sort((a, b) => a.seasonNumber - b.seasonNumber);
  const episodes: TmdbEpisodeDetail[] = [];
  for (const s of seasons) {
    episodes.push(...(await getTvSeasonEpisodesDetail(apiKey, tmdbId, s.seasonNumber)));
  }
  const delta = checkEp1AirDate(ctx, episodes[0]);
  if (delta === null) return null;
  return { episodes, delta };
}

async function trySeasonStrategy(
  apiKey: string,
  tmdbId: string,
  summary: TmdbShowSummary,
  ctx: AnimeMatchContext,
  anilistTotal: number,
): Promise<{ episodes: TmdbEpisodeDetail[]; season: number; delta: number } | null> {
  const candidateSeasons = summary.seasons.filter((s) => s.episodeCount === anilistTotal);
  for (const s of candidateSeasons) {
    const episodes = await getTvSeasonEpisodesDetail(apiKey, tmdbId, s.seasonNumber);
    const delta = checkEp1AirDate(ctx, episodes[0]);
    if (delta !== null) return { episodes, season: s.seasonNumber, delta };
  }
  return null;
}

async function tryGroupStrategy(
  apiKey: string,
  tmdbId: string,
  ctx: AnimeMatchContext,
  anilistTotal: number,
): Promise<{ episodes: TmdbEpisodeDetail[]; delta: number } | null> {
  const groups = await getTvEpisodeGroups(apiKey, tmdbId);
  const candidates = groups.filter((g) => g.type === 2 && g.episodeCount === anilistTotal);
  for (const g of candidates) {
    const episodes = await getEpisodeGroupEpisodes(apiKey, g.id);
    const delta = checkEp1AirDate(ctx, episodes[0]);
    if (delta !== null) return { episodes, delta };
  }
  return null;
}

async function searchCandidates(apiKey: string, ctx: AnimeMatchContext) {
  const seen = new Map<number, { id: number; name: string }>();
  for (const query of [ctx.anilistTitleEnglish, ctx.anilistTitleRomaji]) {
    if (!query?.trim()) continue;
    const results = await searchTvForAnimeMatch(apiKey, query);
    for (const r of results) {
      if (!seen.has(r.id)) seen.set(r.id, { id: r.id, name: r.name });
    }
    if (seen.size >= MAX_CANDIDATES) break;
  }
  return Array.from(seen.values()).slice(0, MAX_CANDIDATES);
}

export async function resolveAnimeTmdbMatch(apiKey: string, ctx: AnimeMatchContext): Promise<AnimeMatchResult> {
  const anilistTotal = ctx.anilistTotalEpisodes;
  if (!anilistTotal || anilistTotal <= 0) {
    return { matched: false, reason: "AniList has no known total episode count", triedTmdbId: null, triedTmdbName: null };
  }

  const candidates = await searchCandidates(apiKey, ctx);
  if (candidates.length === 0) {
    return { matched: false, reason: "TMDB search returned no candidates", triedTmdbId: null, triedTmdbName: null };
  }

  let lastTried: { id: number; name: string } | null = null;
  for (const candidate of candidates) {
    lastTried = candidate;
    const summary = await getTvShowSummary(apiKey, String(candidate.id));

    const whole = await tryWholeStrategy(apiKey, String(candidate.id), summary, ctx, anilistTotal);
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

    const season = await trySeasonStrategy(apiKey, String(candidate.id), summary, ctx, anilistTotal);
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

    const group = await tryGroupStrategy(apiKey, String(candidate.id), ctx, anilistTotal);
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
    .eq("season_number", 1);

  if (error || !data) {
    console.error("  TMDB anime match: failed to load episodes:", error?.message);
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
    if (tmdbEp.name && !row.name) patch.name = tmdbEp.name;
    if (Object.keys(patch).length === 0) continue;

    const { error: updateError } = await supabase.from("episodes").update(patch).eq("id", row.id);
    if (updateError) {
      console.error("  TMDB anime match: failed to update episode", row.id, updateError.message);
      continue;
    }
    episodesUpdated++;
  }

  return { episodesUpdated };
}
