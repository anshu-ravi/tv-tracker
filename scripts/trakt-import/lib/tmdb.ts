// Minimal standalone TMDB client for the import tool. Deliberately NOT
// importing src/lib/tmdb.ts — that file starts with `import "server-only"`,
// which throws outside a Next.js server context (this runs under plain tsx).
// Same endpoints/fields, no Next-specific fetch caching (we use our own
// on-disk cache instead).

import { cached } from "./cache";

const BASE = "https://api.themoviedb.org/3";
export const TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w500";

function authHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}`, accept: "application/json" };
}

async function tmdbFetch<T>(
  apiKey: string,
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: authHeaders(apiKey) });
  if (!res.ok) {
    throw new Error(`TMDB ${path} failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  poster_path: string | null;
  status: string; // "Returning Series" | "Ended" | "Canceled" | "In Production" | "Planned"
  number_of_episodes: number | null;
  origin_country: string[];
  genres: { id: number; name: string }[];
  seasons: { season_number: number; episode_count: number }[];
}

export interface TmdbSeasonEpisode {
  season_number: number;
  episode_number: number;
  name: string | null;
  air_date: string | null;
  runtime: number | null;
}

export interface TmdbSeasonDetails {
  season_number: number;
  episodes: TmdbSeasonEpisode[];
}

const RUNNING_STATUSES = ["Returning Series", "In Production", "Planned"];

export function isRunningStatus(status: string): boolean {
  return RUNNING_STATUSES.includes(status);
}

export async function getTvDetails(
  apiKey: string,
  tmdbId: number,
): Promise<TmdbTvDetails> {
  return cached(`tmdb-tv-${tmdbId}`, () =>
    tmdbFetch<TmdbTvDetails>(apiKey, `/tv/${tmdbId}`),
  );
}

export async function getSeasonDetails(
  apiKey: string,
  tmdbId: number,
  seasonNumber: number,
): Promise<TmdbSeasonDetails> {
  return cached(`tmdb-tv-${tmdbId}-season-${seasonNumber}`, () =>
    tmdbFetch<TmdbSeasonDetails>(apiKey, `/tv/${tmdbId}/season/${seasonNumber}`),
  );
}
