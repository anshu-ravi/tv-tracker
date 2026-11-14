import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

interface ResolveBody {
  watched?: boolean;
}

interface SeasonEpisodeRow {
  id: string;
  air_date: string | null;
}

// POST /api/titles/:titleId/resolve — answers "did you watch the latest
// season?" for a title flagged by an import (user_titles.pending_season_check).
// Body: { watched: boolean }. true marks that season's aired episodes watched
// with no date; either answer clears the flag. Ticking an episode of that
// season anywhere else clears it too (clear_pending_season_check trigger).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ titleId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const { titleId } = await params;

  let body: ResolveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.watched !== "boolean") {
    return NextResponse.json({ error: "watched must be a boolean" }, { status: 400 });
  }

  const { data: userTitle, error: lookupError } = await supabase
    .from("user_titles")
    .select("pending_season_check")
    .eq("title_id", titleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    console.error("Failed to look up pending season check:", lookupError);
    return NextResponse.json({ error: "Failed to look up title" }, { status: 500 });
  }

  const seasonNumber = userTitle?.pending_season_check as number | null | undefined;
  if (seasonNumber == null) {
    return NextResponse.json({ error: "Nothing to resolve for this title" }, { status: 404 });
  }

  let marked = 0;
  if (body.watched) {
    const { data: episodes, error: episodesError } = await supabase
      .from("episodes")
      .select("id, air_date")
      .eq("title_id", titleId)
      .eq("season_number", seasonNumber);

    if (episodesError) {
      console.error("Failed to look up season episodes:", episodesError);
      return NextResponse.json({ error: "Failed to look up season episodes" }, { status: 500 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const aired = ((episodes ?? []) as SeasonEpisodeRow[]).filter(
      (e) => e.air_date == null || e.air_date <= today,
    );

    if (aired.length > 0) {
      // watched_at is null on purpose: he watched it, but we don't know when.
      const { error: markError } = await supabase.from("watched_episodes").upsert(
        aired.map((e) => ({ episode_id: e.id, title_id: titleId, watched_at: null })),
        { onConflict: "user_id,episode_id", ignoreDuplicates: true },
      );

      if (markError) {
        console.error("Failed to mark season watched:", markError);
        return NextResponse.json({ error: "Failed to mark season watched" }, { status: 500 });
      }
      marked = aired.length;
    }
  }

  const { error: clearError } = await supabase
    .from("user_titles")
    .update({ pending_season_check: null })
    .eq("title_id", titleId)
    .eq("user_id", user.id);

  if (clearError) {
    console.error("Failed to clear pending season check:", clearError);
    return NextResponse.json({ error: "Failed to save answer" }, { status: 500 });
  }

  return NextResponse.json({ resolved: true, marked });
}
