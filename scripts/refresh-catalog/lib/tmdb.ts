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
): Promise<{ title: NormalizedTitle; episodes: NormalizedEpisode[] }> {
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
  for (const s of seasons) {
    const sd = await tmdbFetch<{ episodes: TmdbEpisode[] }>(
      apiKey,
      `/tv/${tmdbId}/season/${s.season_number}`,
    );
    for (const e of sd.episodes) {
      episodes.push({
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

  return { title, episodes };
}
