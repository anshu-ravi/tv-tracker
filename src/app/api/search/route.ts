import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { searchTv } from "@/lib/tmdb";
import type { SearchResult } from "@/lib/types";

// GET /api/search?q=... — queries TMDB (searchTv already classifies each
// result as "tv" or "anime" — see classifyTmdbSearchResult in lib/tmdb.ts)
// and returns the normalized results for the Search screen to render and
// add from directly. AniList has been fully retired: anime is TMDB-sourced
// end to end and no catalog rows reference AniList anymore.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] satisfies SearchResult[] });
  }

  let results: SearchResult[] = [];
  try {
    results = await searchTv(q);
  } catch (err) {
    console.error("TMDB search failed:", err);
  }

  return NextResponse.json({ results });
}
