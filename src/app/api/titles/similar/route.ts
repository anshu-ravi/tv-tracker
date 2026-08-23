import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { getSimilarMovie, getSimilarTv } from "@/lib/tmdb";
import {
  titleKey,
  type DataSource,
  type ExistingLibraryEntry,
  type MediaType,
  type SearchResult,
  type WatchStatus,
} from "@/lib/types";

interface TitleRow {
  id: string;
  source: DataSource;
  source_id: string;
  media_type: MediaType;
}

interface UserTitleRow {
  status: WatchStatus;
  titles: TitleRow | null;
}

const MEDIA_TYPES: MediaType[] = ["tv", "anime", "movie"];

// Decorative rail fetch — a TMDB failure must never break the title page it
// sits on, so it's caught here and degrades to an empty list (see
// getSimilarTv/getSimilarMovie in lib/tmdb.ts for the actual calls).
async function fetchSimilar(mediaType: MediaType, sourceId: string): Promise<SearchResult[]> {
  try {
    return mediaType === "movie"
      ? await getSimilarMovie(sourceId)
      : await getSimilarTv(sourceId, mediaType === "anime");
  } catch (err) {
    console.error("TMDB similar-titles fetch failed:", err);
    return [];
  }
}

// Shown-but-deprioritized: titles already in the library are pushed to the
// end of the rail rather than filtered out, so the ranked order from
// lib/tmdb.ts is preserved within each group. This is the "final 12+6
// shaping" the SIMILAR_LIBRARY_CAP comment in lib/tmdb.ts refers to.
const UNTRACKED_CAP = 12;
const TRACKED_CAP = 6;

function partitionByTracked(
  results: SearchResult[],
  existing: Record<string, ExistingLibraryEntry>,
): SearchResult[] {
  const untracked: SearchResult[] = [];
  const tracked: SearchResult[] = [];
  for (const r of results) {
    const key = titleKey(r.source, r.sourceId, r.mediaType);
    (existing[key] ? tracked : untracked).push(r);
  }
  return [...untracked.slice(0, UNTRACKED_CAP), ...tracked.slice(0, TRACKED_CAP)];
}

// GET /api/titles/similar?source=tmdb&sourceId=...&mediaType=... — backs the
// "Similar" rail (SimilarRail) on both title screens. Existing-library
// lookup mirrors explore/page.tsx so results can be flagged already-tracked
// the same way search/explore results are.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const source = request.nextUrl.searchParams.get("source");
  const sourceId = request.nextUrl.searchParams.get("sourceId")?.trim() ?? "";
  const mediaTypeParam = request.nextUrl.searchParams.get("mediaType");

  if (source !== "tmdb") {
    return NextResponse.json({ error: "source must be 'tmdb'" }, { status: 400 });
  }
  if (!sourceId) {
    return NextResponse.json({ error: "sourceId is required" }, { status: 400 });
  }
  if (!MEDIA_TYPES.includes(mediaTypeParam as MediaType)) {
    return NextResponse.json(
      { error: "mediaType must be 'tv', 'anime', or 'movie'" },
      { status: 400 },
    );
  }
  const mediaType = mediaTypeParam as MediaType;

  const [rawResults, { data, error }] = await Promise.all([
    fetchSimilar(mediaType, sourceId),
    supabase.from("user_titles").select("status, titles(id, source, source_id, media_type)"),
  ]);

  if (error) throw error;

  const rows = (data ?? []) as unknown as UserTitleRow[];
  const existing: Record<string, ExistingLibraryEntry> = {};
  for (const row of rows) {
    if (!row.titles) continue;
    const key = titleKey(row.titles.source, row.titles.source_id, row.titles.media_type);
    existing[key] = { status: row.status, titleId: row.titles.id };
  }

  // TMDB occasionally lists a title among its own recommendations.
  const filtered = rawResults.filter((r) => r.sourceId !== sourceId);
  const results = partitionByTracked(filtered, existing);

  return NextResponse.json({ results, existing });
}
