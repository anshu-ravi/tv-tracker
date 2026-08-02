// Minimal standalone TMDB client for the refresh script. Deliberately NOT
// importing src/lib/tmdb.ts — that file starts with `import "server-only"`,
// which throws outside a Next.js server context (this runs under plain
// tsx). Same endpoints/fields; no Next fetch caching, since a refresh's
// whole point is to see current data.

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

export interface NormalizedTitle {
  title: string;
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

export interface NormalizedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  absoluteNumber: number | null;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  stillUrl: string | null;
  runtime: number | null;
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

function img(path: string | null | undefined, size = "w500"): string | null {
  return path ? `${IMG}/${size}${path}` : null;
}

async function tmdbFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function getTvTitle(
  apiKey: string,
  tmdbId: string,
  // `mediaType` mirrors src/lib/tmdb.ts's getTvTitle: anime is TMDB-sourced
  // too now, fetched via the same /tv endpoint, but still needs an
  // absolute_number computed per episode for filler-tag lookups
  // (src/lib/animefillerlist.ts). Defaults to "tv" for the TV call site.
  opts: { mediaType?: "tv" | "anime" } = {},
): Promise<{ title: NormalizedTitle; episodes: NormalizedEpisode[] }> {
  const mediaType = opts.mediaType ?? "tv";
  const tv = await tmdbFetch<TmdbTv>(apiKey, `/tv/${tmdbId}`);
  const next = tv.next_episode_to_air;

  const title: NormalizedTitle = {
    title: tv.name,
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

  const seasons = tv.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0);
  const episodes: NormalizedEpisode[] = [];
  // Anime keeps an absolute_number (1..N across all real seasons, broadcast
  // order) — only advances/is used when mediaType is "anime", same as
  // src/lib/tmdb.ts's getTvTitle.
  let absoluteCounter = 0;
  for (const s of seasons) {
    const sd = await tmdbFetch<{ episodes: TmdbEpisode[] }>(
      apiKey,
      `/tv/${tmdbId}/season/${s.season_number}`,
    );
    for (const e of sd.episodes) {
      absoluteCounter += 1;
      episodes.push({
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        absoluteNumber: mediaType === "anime" ? absoluteCounter : null,
        name: e.name,
        overview: e.overview,
        airDate: e.air_date || null,
        stillUrl: img(e.still_path, "w300"),
        runtime: e.runtime,
      });
    }
  }

  return { title, episodes };
}

// ---- anime enrichment (lib/tmdbAnimeMatch.ts) --------------------------------
// Standalone mirrors of the extra endpoints src/lib/tmdb.ts's anime matcher
// uses. Same reasoning as the rest of this file: no server-only import, apiKey
// passed explicitly instead of read from process.env inside the client.

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
    stillUrl: img(e.still_path, "w300"),
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
        stillUrl: img(e.still_path, "w300"),
        runtime: e.runtime,
      });
    }
  }
  return out;
}
