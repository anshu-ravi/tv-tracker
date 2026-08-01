// Matching logic — copied/adapted from scripts/tmdb-anime-match/lib/matcher.ts
// (`resolveAnimeTmdbMatch`), which itself mirrors src/lib/tmdbAnimeMatch.ts /
// scripts/refresh-catalog/lib/tmdbAnimeMatch.ts. This tool is self-contained
// (does not import scripts/tmdb-anime-match/), but the matching RULES must
// stay identical: whole -> season -> group, each gated on BOTH an
// episode-count match AND an air-date check (+/-7 days) on absolute #1.
//
// Unlike the original tool, this file's job is not just to decide "is there
// a match" but to produce the full absolute-number -> TMDB (season, episode)
// MAPPING that the migration will write, so `resolveAnimeTmdbMapping` returns
// the per-episode TMDB data keyed by absolute number (1..N) directly.

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

// One TMDB episode mapped onto an absolute number — season/episode are the
// new real coordinates; the rest are the null-only enrichment fields.
export interface MappedEpisode {
  absoluteNumber: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  stillUrl: string | null;
  runtime: number | null;
  airDate: string | null;
}

export interface AnimeMatchSuccess {
  matched: true;
  tmdbId: number;
  tmdbName: string;
  strategy: TmdbMatchStrategy;
  season: number | null;
  mapping: Map<number, MappedEpisode>; // absolute number -> mapped episode
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

function buildMapping(episodes: TmdbEpisodeDetail[]): Map<number, MappedEpisode> {
  const map = new Map<number, MappedEpisode>();
  episodes.forEach((e, i) => {
    map.set(i + 1, {
      absoluteNumber: i + 1,
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
      name: e.name,
      overview: e.overview,
      stillUrl: e.stillUrl,
      runtime: e.runtime,
      airDate: e.airDate,
    });
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

export async function resolveAnimeTmdbMapping(apiKey: string, ctx: AnimeMatchContext): Promise<AnimeMatchResult> {
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
        mapping: buildMapping(whole.episodes),
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
        mapping: buildMapping(season.episodes),
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
        mapping: buildMapping(group.episodes),
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

// Builds a mapping directly from one TMDB season, for a manually --pin'd
// title (strategy 'season'). No air-date/episode-count gate — a human pin
// is itself the evidence, printed for review at pin time.
export async function buildPinnedSeasonMapping(
  apiKey: string,
  tmdbId: string,
  season: number,
): Promise<Map<number, MappedEpisode>> {
  const episodes = await getTvSeasonEpisodesDetail(apiKey, tmdbId, season);
  return buildMapping(episodes);
}

// Builds a mapping by flattening ALL real seasons ascending (strategy
// 'whole'), for a manually --pin'd title with no season given.
export async function buildPinnedWholeMapping(apiKey: string, tmdbId: string): Promise<Map<number, MappedEpisode>> {
  const summary = await getTvShowSummary(apiKey, tmdbId);
  const seasons = summary.seasons.slice().sort((a, b) => a.seasonNumber - b.seasonNumber);
  const episodes: TmdbEpisodeDetail[] = [];
  for (const s of seasons) {
    episodes.push(...(await getTvSeasonEpisodesDetail(apiKey, tmdbId, s.seasonNumber)));
  }
  return buildMapping(episodes);
}
