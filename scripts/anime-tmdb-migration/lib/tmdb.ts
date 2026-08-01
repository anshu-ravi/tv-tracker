// Standalone TMDB client — copied/adapted from scripts/tmdb-anime-match/lib/tmdb.ts
// and scripts/refresh-catalog/lib/tmdb.ts. Not importing src/lib/tmdb.ts:
// that file starts with `import "server-only"`, which throws outside a
// Next.js server context (this runs under plain tsx).

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

function img(path: string | null | undefined, size = "w500"): string | null {
  return path ? `${IMG}/${size}${path}` : null;
}

function imgStill(path: string | null | undefined): string | null {
  return path ? `${IMG}/w300${path}` : null;
}

async function tmdbFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface TmdbTv {
  id: number;
  name: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  status: string;
  number_of_episodes: number | null;
  seasons: { season_number: number; episode_count: number }[];
  next_episode_to_air: {
    air_date: string | null;
    season_number: number;
    episode_number: number;
  } | null;
}

interface TmdbEpisode {
  season_number: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  still_path: string | null;
  runtime: number | null;
}

const RUNNING_STATUSES = ["Returning Series", "In Production", "Planned"];

export interface NormalizedTitle {
  tmdbId: number;
  name: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string | null;
  firstAirDate: string | null;
  releaseStatus: string;
  isRunning: boolean;
  totalEpisodes: number | null;
  nextEpisodeAirDate: string | null;
  nextEpisodeLabel: string | null;
}

// Full show details, used for the title-row refresh + the --pin human-review
// printout (season structure/episode counts/air dates).
export async function getTvShowDetails(apiKey: string, tmdbId: string): Promise<NormalizedTitle> {
  const tv = await tmdbFetch<TmdbTv>(apiKey, `/tv/${tmdbId}`);
  const next = tv.next_episode_to_air;
  return {
    tmdbId: tv.id,
    name: tv.name,
    posterUrl: img(tv.poster_path),
    backdropUrl: img(tv.backdrop_path, "w780"),
    overview: tv.overview,
    firstAirDate: tv.first_air_date || null,
    releaseStatus: tv.status,
    isRunning: RUNNING_STATUSES.includes(tv.status),
    totalEpisodes: tv.number_of_episodes ?? null,
    nextEpisodeAirDate: next?.air_date ?? null,
    nextEpisodeLabel: next ? `S${next.season_number} E${next.episode_number}` : null,
  };
}

export interface TmdbMatchCandidate {
  id: number;
  name: string;
  firstAirDate: string | null;
}

interface TmdbSearchTvResult {
  id: number;
  name: string;
  first_air_date: string | null;
}

export async function searchTvForAnimeMatch(apiKey: string, query: string): Promise<TmdbMatchCandidate[]> {
  if (!query.trim()) return [];
  const url = new URL(BASE + "/search/tv");
  url.searchParams.set("query", query);
  url.searchParams.set("include_adult", "false");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" } });
  if (!res.ok) throw new Error(`TMDB /search/tv failed: ${res.status}`);
  const data = (await res.json()) as { results: TmdbSearchTvResult[] };
  return data.results.slice(0, 5).map((r) => ({ id: r.id, name: r.name, firstAirDate: r.first_air_date || null }));
}

export interface TmdbSeasonSummary {
  seasonNumber: number;
  episodeCount: number;
}

export interface TmdbShowSummary {
  id: number;
  name: string;
  totalEpisodes: number | null;
  seasons: TmdbSeasonSummary[];
}

export async function getTvShowSummary(apiKey: string, tmdbId: string): Promise<TmdbShowSummary> {
  const tv = await tmdbFetch<TmdbTv>(apiKey, `/tv/${tmdbId}`);
  const seasons = tv.seasons
    .filter((s) => s.season_number > 0)
    .map((s) => ({ seasonNumber: s.season_number, episodeCount: s.episode_count }));
  return {
    id: tv.id,
    name: tv.name,
    totalEpisodes: seasons.reduce((sum, s) => sum + s.episodeCount, 0) || null,
    seasons,
  };
}

export interface TmdbEpisodeDetail {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  stillUrl: string | null;
  runtime: number | null;
}

export async function getTvSeasonEpisodesDetail(
  apiKey: string,
  tmdbId: string,
  seasonNumber: number,
): Promise<TmdbEpisodeDetail[]> {
  const sd = await tmdbFetch<{ episodes: TmdbEpisode[] }>(apiKey, `/tv/${tmdbId}/season/${seasonNumber}`);
  return sd.episodes.map((e) => ({
    seasonNumber: e.season_number,
    episodeNumber: e.episode_number,
    name: e.name,
    overview: e.overview,
    airDate: e.air_date || null,
    stillUrl: imgStill(e.still_path),
    runtime: e.runtime,
  }));
}

export interface TmdbEpisodeGroupSummary {
  id: string;
  name: string;
  type: number;
  episodeCount: number;
  groupCount: number;
}

interface TmdbEpisodeGroupsResponse {
  results: { id: string; name: string; type: number; episode_count: number; group_count: number }[];
}

export async function getTvEpisodeGroups(apiKey: string, tmdbId: string): Promise<TmdbEpisodeGroupSummary[]> {
  const data = await tmdbFetch<TmdbEpisodeGroupsResponse>(apiKey, `/tv/${tmdbId}/episode_groups`);
  return data.results.map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    episodeCount: g.episode_count,
    groupCount: g.group_count,
  }));
}

interface TmdbEpisodeGroupDetailResponse {
  groups: { order: number; episodes: TmdbEpisode[] }[];
}

export async function getEpisodeGroupEpisodes(apiKey: string, groupId: string): Promise<TmdbEpisodeDetail[]> {
  const data = await tmdbFetch<TmdbEpisodeGroupDetailResponse>(apiKey, `/tv/episode_group/${groupId}`);
  const out: TmdbEpisodeDetail[] = [];
  for (const g of data.groups.slice().sort((a, b) => a.order - b.order)) {
    for (const e of g.episodes) {
      out.push({
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        name: e.name,
        overview: e.overview,
        airDate: e.air_date || null,
        stillUrl: imgStill(e.still_path),
        runtime: e.runtime,
      });
    }
  }
  return out;
}
