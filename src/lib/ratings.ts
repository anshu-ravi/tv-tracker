import "server-only";
import { getMovieImdbId, getTvImdbId } from "@/lib/tmdb";
import type { TitleRatings } from "@/lib/types";

// Live ratings for the title detail screen: IMDb + Rotten Tomatoes via OMDb.
// Not stored in the DB — fetched on demand each time the detail page
// renders, same pattern as lib/animefillerlist.ts. Any failure (network,
// missing key, no match) must degrade to an all-null TitleRatings so a
// broken/absent third party never breaks the title detail page.

const DAY = 60 * 60 * 24;
const EMPTY_RATINGS: TitleRatings = { imdb: null, rottenTomatoes: null };

interface OmdbResponse {
  Response: "True" | "False";
  imdbRating?: string;
  Ratings?: { Source: string; Value: string }[];
}

function parseImdbRating(value: string | undefined): number | null {
  if (!value || value === "N/A") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseRottenTomatoes(ratings: OmdbResponse["Ratings"]): number | null {
  const rt = ratings?.find((r) => r.Source === "Rotten Tomatoes");
  if (!rt) return null;
  const match = rt.Value.match(/^(\d+)%$/);
  return match ? Number(match[1]) : null;
}

// Shared OMDb lookup by IMDb id — both getTvRatings and getMovieRatings
// resolve their TMDB id to an IMDb id differently (getTvImdbId vs
// getMovieImdbId) but hit the same OMDb endpoint once they have one.
async function fetchRatingsByImdbId(imdbId: string | null): Promise<TitleRatings> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey || !imdbId) return EMPTY_RATINGS;

  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("i", imdbId);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url, { next: { revalidate: DAY } });
  if (!res.ok) return EMPTY_RATINGS;

  const data = (await res.json()) as OmdbResponse;
  if (data.Response !== "True") return EMPTY_RATINGS;

  return {
    imdb: parseImdbRating(data.imdbRating),
    rottenTomatoes: parseRottenTomatoes(data.Ratings),
  };
}

export async function getTvRatings(tmdbId: string): Promise<TitleRatings> {
  try {
    const imdbId = await getTvImdbId(tmdbId);
    return await fetchRatingsByImdbId(imdbId);
  } catch (err) {
    console.error("Failed to fetch TV ratings:", err);
    return EMPTY_RATINGS;
  }
}

export async function getMovieRatings(tmdbId: string): Promise<TitleRatings> {
  try {
    const imdbId = await getMovieImdbId(tmdbId);
    return await fetchRatingsByImdbId(imdbId);
  } catch (err) {
    console.error("Failed to fetch movie ratings:", err);
    return EMPTY_RATINGS;
  }
}
