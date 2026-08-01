import "server-only";
import type {
  NormalizedEpisode,
  NormalizedTitle,
  SearchResult,
  TitleCredits,
} from "@/lib/types";

// TMDB client (TV shows/movies). Server-only — uses the API Read Access Token
// (v4 bearer) from TMDB_API_KEY. Never import this into a Client Component.

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

function authHeaders(): HeadersInit {
  const token = process.env.TMDB_API_KEY;
  if (!token) throw new Error("TMDB_API_KEY is not set");
  return { Authorization: `Bearer ${token}`, accept: "application/json" };
}

async function tmdb<T>(
  path: string,
  params: Record<string, string | number> = {},
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: authHeaders(),
    next: { revalidate: 60 * 60 }, // cache metadata for an hour
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function img(path: string | null | undefined, size = "w500"): string | null {
  return path ? `${IMG}/${size}${path}` : null;
}

// ---- response shapes (only the fields we read) ------------------------------

interface TmdbSearchTvResult {
  id: number;
  name: string;
  first_air_date: string | null;
  poster_path: string | null;
  overview: string | null;
}

interface TmdbTv {
  id: number;
  name: string;
  original_name: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  status: string;
  number_of_episodes: number | null;
  seasons: { season_number: number; episode_count: number }[];
  created_by: { name: string }[];
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

interface TmdbCredits {
  cast: {
    name: string;
    character: string | null;
    profile_path: string | null;
    order: number;
  }[];
}

const RUNNING_STATUSES = ["Returning Series", "In Production", "Planned"];

// ---- public API -------------------------------------------------------------

export async function searchTv(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const data = await tmdb<{ results: TmdbSearchTvResult[] }>("/search/tv", {
    query,
    include_adult: "false",
  });
  return data.results.slice(0, 12).map((r) => ({
    source: "tmdb",
    sourceId: String(r.id),
    mediaType: "tv",
    title: r.name,
    year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
    posterUrl: img(r.poster_path),
    overview: r.overview,
  }));
}

export async function getTvTitle(
  id: string,
): Promise<{ title: NormalizedTitle; episodes: NormalizedEpisode[] }> {
  const tv = await tmdb<TmdbTv>(`/tv/${id}`);
  const next = tv.next_episode_to_air;

  const title: NormalizedTitle = {
    source: "tmdb",
    sourceId: String(tv.id),
    mediaType: "tv",
    title: tv.name,
    originalTitle: tv.original_name,
    posterUrl: img(tv.poster_path),
    backdropUrl: img(tv.backdrop_path, "w780"),
    overview: tv.overview,
    firstAirDate: tv.first_air_date || null,
    releaseStatus: tv.status,
    isRunning: RUNNING_STATUSES.includes(tv.status),
    totalEpisodes: tv.number_of_episodes ?? null,
    nextEpisodeAirDate: next?.air_date ?? null,
    nextEpisodeLabel: next
      ? `S${next.season_number} E${next.episode_number}`
      : null,
  };

  // Fetch episodes per real season (skip specials in season 0).
  const seasons = tv.seasons.filter(
    (s) => s.season_number > 0 && s.episode_count > 0,
  );
  const episodes: NormalizedEpisode[] = [];
  for (const s of seasons) {
    const sd = await tmdb<{ episodes: TmdbEpisode[] }>(
      `/tv/${id}/season/${s.season_number}`,
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

// Creators + top cast for the detail screen. Fetched separately (not baked
// into getTvTitle) since it's only needed when a user opens a title's detail
// page, not on every add/search. `append_to_response=credits` gets both
// created_by and the cast list in one request.
export async function getTvCredits(id: string): Promise<TitleCredits> {
  const tv = await tmdb<TmdbTv & { credits?: TmdbCredits }>(`/tv/${id}`, {
    append_to_response: "credits",
  });

  const creators = (tv.created_by ?? []).map((c) => c.name);
  const cast = (tv.credits?.cast ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 10)
    .map((c) => ({
      name: c.name,
      role: c.character,
      imageUrl: img(c.profile_path, "w185"),
    }));

  return { creators, cast };
}

// IMDb id for a TV show, used to look up OMDb ratings (see lib/ratings.ts).
// TMDB's external_ids endpoint returns null when a show has no IMDb entry.
export async function getTvImdbId(id: string): Promise<string | null> {
  const data = await tmdb<{ imdb_id: string | null }>(`/tv/${id}/external_ids`);
  return data.imdb_id || null;
}
