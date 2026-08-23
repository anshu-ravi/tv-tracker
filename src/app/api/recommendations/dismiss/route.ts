import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import type { DataSource, MediaType } from "@/lib/types";

interface DismissBody {
  source?: DataSource;
  sourceId?: string;
  mediaType?: MediaType;
}

const MEDIA_TYPES: MediaType[] = ["tv", "anime", "movie"];

interface ValidTriple {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
}

// Same validation shape as GET /api/titles/similar: source is always 'tmdb'
// (the only provider recommendations are ever built from).
function validateTriple(body: DismissBody): ValidTriple | { error: string } {
  if (body.source !== "tmdb") {
    return { error: "source must be 'tmdb'" };
  }
  const sourceId = body.sourceId?.trim() ?? "";
  if (!sourceId) {
    return { error: "sourceId is required" };
  }
  if (!MEDIA_TYPES.includes(body.mediaType as MediaType)) {
    return { error: "mediaType must be 'tv', 'anime', or 'movie'" };
  }
  return { source: "tmdb", sourceId, mediaType: body.mediaType as MediaType };
}

async function parseBody(request: NextRequest): Promise<DismissBody | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// POST /api/recommendations/dismiss — records a permanent "not interested"
// for a candidate title (rec_dismissals — see the recommendations
// migration) and immediately removes it from every rail it's currently in,
// rather than waiting for the next rebuild.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const body = await parseBody(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const triple = validateTriple(body);
  if ("error" in triple) {
    return NextResponse.json({ error: triple.error }, { status: 400 });
  }
  const { source, sourceId, mediaType } = triple;

  // user_id is left out so the column default (auth.uid()) applies, same
  // convention as the watched-episode upserts; ignoreDuplicates makes a
  // repeat dismissal a no-op instead of a conflict error.
  const { error: dismissError } = await supabase.from("rec_dismissals").upsert(
    { source, source_id: sourceId, media_type: mediaType },
    { onConflict: "user_id,source,source_id,media_type", ignoreDuplicates: true },
  );

  if (dismissError) {
    console.error("Failed to record dismissal:", dismissError);
    return NextResponse.json({ error: "Failed to dismiss title" }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("recommendations")
    .delete()
    .eq("source", source)
    .eq("source_id", sourceId)
    .eq("media_type", mediaType)
    .eq("user_id", user.id);

  if (deleteError) {
    console.error("Failed to remove dismissed title from recommendations:", deleteError);
    return NextResponse.json({ error: "Failed to dismiss title" }, { status: 500 });
  }

  return NextResponse.json({ dismissed: true }, { status: 201 });
}

// DELETE /api/recommendations/dismiss — undoes a dismissal. Does not restore
// any recommendation rows removed by the POST above; the next rebuild brings
// the title back on its own if it still scores.
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const body = await parseBody(request);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const triple = validateTriple(body);
  if ("error" in triple) {
    return NextResponse.json({ error: triple.error }, { status: 400 });
  }
  const { source, sourceId, mediaType } = triple;

  const { error } = await supabase
    .from("rec_dismissals")
    .delete()
    .eq("source", source)
    .eq("source_id", sourceId)
    .eq("media_type", mediaType)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to undo dismissal:", error);
    return NextResponse.json({ error: "Failed to undo dismissal" }, { status: 500 });
  }

  return NextResponse.json({ dismissed: false });
}
