import { NextRequest, NextResponse } from "next/server";
import { searchAnime } from "@/lib/anilist";
import { requireUser } from "@/lib/api/auth";
import { searchTv } from "@/lib/tmdb";
import type { SearchResult } from "@/lib/types";

// GET /api/search?q=... — queries TMDB (TV) and AniList (anime) in parallel
// and merges the normalized results into one list the Search screen can
// render and add from directly.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] satisfies SearchResult[] });
  }

  // Promise.allSettled (not Promise.all) so one provider being down doesn't
  // take out the whole search — we just return what succeeded.
  const [tv, anime] = await Promise.allSettled([searchTv(q), searchAnime(q)]);

  if (tv.status === "rejected") {
    console.error("TMDB search failed:", tv.reason);
  }
  if (anime.status === "rejected") {
    console.error("AniList search failed:", anime.reason);
  }

  const tvResults = tv.status === "fulfilled" ? tv.value : [];
  const animeResults = anime.status === "fulfilled" ? anime.value : [];

  // Prefer AniList when the same show shows up on both providers (common for
  // anime, since TMDB also lists it under "tv"). Match conservatively — only
  // an exact normalized-title match counts as a duplicate — and drop the
  // TMDB copy so the AniList one wins.
  const animeTitles = new Set(animeResults.map((r) => normalizeTitle(r.title)));
  const dedupedTvResults = tvResults.filter(
    (r) => !animeTitles.has(normalizeTitle(r.title)),
  );

  const results: SearchResult[] = [...animeResults, ...dedupedTvResults];

  return NextResponse.json({ results });
}

// lowercase, trim, collapse whitespace, strip non-alphanumerics — so "Attack
// on Titan" and "attack on titan!" compare equal but unrelated titles don't
// accidentally collide.
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
