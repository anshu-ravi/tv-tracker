import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { getTrending } from "@/lib/tmdb";
import type { SearchResult } from "@/lib/types";

// GET /api/search/explore — trending TV + anime rails shown on the Search
// screen before the owner types a query. See getTrending() in lib/tmdb.ts
// for how the mixed trending feed is split and the anime rail topped up.
export async function GET() {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  let tv: SearchResult[] = [];
  let anime: SearchResult[] = [];
  try {
    const trending = await getTrending();
    tv = trending.tv;
    anime = trending.anime;
  } catch (err) {
    console.error("TMDB trending fetch failed:", err);
  }

  return NextResponse.json({ tv, anime });
}
