import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { searchMovie, searchTv } from "@/lib/tmdb";
import type { SearchResult } from "@/lib/types";

// Merges the tv/anime and movie result lists for display. Neither TMDB
// search endpoint's response carries a numeric popularity score in the
// normalized SearchResult shape (see lib/types.ts), but TMDB already
// returns each list sorted by its own relevance/popularity ranking — so a
// round-robin interleave (best tv/anime hit, best movie hit, second-best
// tv/anime hit, ...) approximates a combined popularity ordering without
// requiring either list to carry a raw score. Plain concatenation would
// bury every movie result behind up to 12 tv/anime ones, which is wrong
// for a query like "inception" where the movie is the obvious top hit.
function interleave(a: SearchResult[], b: SearchResult[]): SearchResult[] {
  const merged: SearchResult[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) merged.push(a[i]);
    if (i < b.length) merged.push(b[i]);
  }
  return merged;
}

// GET /api/search?q=... — queries TMDB's /search/tv (classified as "tv" or
// "anime" — see classifyTmdbSearchResult in lib/tmdb.ts) and /search/movie
// in parallel and interleaves the results for the Search screen to render
// and add from directly. AniList has been fully retired: anime is
// TMDB-sourced end to end and no catalog rows reference AniList anymore.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] satisfies SearchResult[] });
  }

  // Run both providers concurrently — this endpoint is on the user's
  // critical (typing) path — and let either one fail without blanking the
  // other's results, same tolerance the old single-call version had.
  const [tvSettled, movieSettled] = await Promise.allSettled([
    searchTv(q),
    searchMovie(q),
  ]);

  if (tvSettled.status === "rejected") {
    console.error("TMDB tv/anime search failed:", tvSettled.reason);
  }
  if (movieSettled.status === "rejected") {
    console.error("TMDB movie search failed:", movieSettled.reason);
  }

  const tvResults = tvSettled.status === "fulfilled" ? tvSettled.value : [];
  const movieResults = movieSettled.status === "fulfilled" ? movieSettled.value : [];

  return NextResponse.json({ results: interleave(tvResults, movieResults) });
}
