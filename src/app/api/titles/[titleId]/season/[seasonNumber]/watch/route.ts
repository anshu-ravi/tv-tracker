import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

// POST /api/titles/:titleId/season/:seasonNumber/watch — mark every episode
// of a season watched for the caller. DELETE the same URL unmarks them.
// Both look up the season's episode ids first (episodes are shared catalog
// rows, keyed by title_id + season_number), then bulk write watched_episodes
// scoped to the caller. Idempotent, same as the per-episode endpoint.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ titleId: string; seasonNumber: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { titleId, seasonNumber } = await params;

  const { data: episodes, error: episodesError } = await supabase
    .from("episodes")
    .select("id")
    .eq("title_id", titleId)
    .eq("season_number", Number(seasonNumber));

  if (episodesError) {
    console.error("Failed to look up season episodes:", episodesError);
    return NextResponse.json(
      { error: "Failed to look up season episodes" },
      { status: 500 },
    );
  }

  const episodeIds = (episodes ?? []).map((e) => e.id as string);
  if (episodeIds.length === 0) {
    return NextResponse.json({ marked: 0 });
  }

  // Same upsert shape as the per-episode route: user_id is left out so the
  // column default (auth.uid()) applies, ignoreDuplicates keeps re-marking
  // an already-watched episode a no-op.
  const { error } = await supabase.from("watched_episodes").upsert(
    episodeIds.map((episodeId) => ({ episode_id: episodeId, title_id: titleId })),
    { onConflict: "user_id,episode_id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("Failed to mark season watched:", error);
    return NextResponse.json(
      { error: "Failed to mark season watched" },
      { status: 500 },
    );
  }

  return NextResponse.json({ marked: episodeIds.length });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ titleId: string; seasonNumber: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const { titleId, seasonNumber } = await params;

  const { data: episodes, error: episodesError } = await supabase
    .from("episodes")
    .select("id")
    .eq("title_id", titleId)
    .eq("season_number", Number(seasonNumber));

  if (episodesError) {
    console.error("Failed to look up season episodes:", episodesError);
    return NextResponse.json(
      { error: "Failed to look up season episodes" },
      { status: 500 },
    );
  }

  const episodeIds = (episodes ?? []).map((e) => e.id as string);
  if (episodeIds.length === 0) {
    return NextResponse.json({ unmarked: 0 });
  }

  const { error } = await supabase
    .from("watched_episodes")
    .delete()
    .eq("user_id", user.id)
    .eq("title_id", titleId)
    .in("episode_id", episodeIds);

  if (error) {
    console.error("Failed to unmark season:", error);
    return NextResponse.json(
      { error: "Failed to unmark season" },
      { status: 500 },
    );
  }

  return NextResponse.json({ unmarked: episodeIds.length });
}
