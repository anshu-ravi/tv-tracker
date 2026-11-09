import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { refreshCatalogTitle } from "@/lib/api/catalog";

// PATCH /api/titles/:titleId/media-type — body { mediaType: "tv" | "anime" }.
// Relabels a shared catalog title, then re-fetches it so absolute episode numbers match the label.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ titleId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;
  const { titleId } = await params;

  let body: { mediaType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { mediaType } = body;
  if (mediaType !== "tv" && mediaType !== "anime") {
    return NextResponse.json({ error: 'mediaType must be "tv" or "anime"' }, { status: 400 });
  }

  const { data: row, error: lookupError } = await supabase
    .from("titles")
    .select("media_type")
    .eq("id", titleId)
    .maybeSingle();
  if (lookupError || !row) {
    return NextResponse.json({ error: "Title not found" }, { status: 404 });
  }
  if (row.media_type === "movie") {
    return NextResponse.json({ error: "Movies can't be relabelled" }, { status: 400 });
  }
  if (row.media_type === mediaType) return NextResponse.json({ ok: true, mediaType });

  // Leaving anime drops the filler verdict; the weekly sweep re-checks it after entering anime.
  const { error: updateError } = await supabase
    .from("titles")
    .update({ media_type: mediaType, filler_available: null, filler_checked_at: null })
    .eq("id", titleId);
  if (updateError) {
    console.error("Failed to relabel title:", updateError);
    return NextResponse.json({ error: "Failed to update title" }, { status: 500 });
  }

  const refreshed = await refreshCatalogTitle(supabase, titleId);
  if ("error" in refreshed) {
    console.error("Relabel succeeded but refresh failed:", refreshed.error);
  }

  return NextResponse.json({ ok: true, mediaType });
}
