import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

// POST /api/episodes/:episodeId/watch — mark an episode watched (one-tap).
// DELETE same URL — unmark it. Both are idempotent: marking an
// already-watched episode or unmarking an already-unwatched one just
// returns success instead of erroring.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { episodeId } = await params;

  // watched_episodes denormalizes title_id (for fast per-show progress
  // counts), so look the episode up first to grab it.
  const { data: episode, error: episodeError } = await supabase
    .from("episodes")
    .select("id, title_id")
    .eq("id", episodeId)
    .maybeSingle();

  if (episodeError) {
    console.error("Failed to look up episode:", episodeError);
    return NextResponse.json(
      { error: "Failed to look up episode" },
      { status: 500 },
    );
  }
  if (!episode) {
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  // Unique on (user_id, episode_id); ignoreDuplicates makes a repeat mark a
  // no-op instead of a conflict error. user_id is left out so the column
  // default (auth.uid()) applies.
  const { data, error } = await supabase
    .from("watched_episodes")
    .upsert(
      { episode_id: episode.id, title_id: episode.title_id },
      { onConflict: "user_id,episode_id", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to mark episode watched:", error);
    return NextResponse.json(
      { error: "Failed to mark episode watched" },
      { status: 500 },
    );
  }

  return NextResponse.json({ watchedEpisode: data }, { status: 201 });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const { episodeId } = await params;

  const { error } = await supabase
    .from("watched_episodes")
    .delete()
    .eq("episode_id", episodeId)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to unmark episode:", error);
    return NextResponse.json(
      { error: "Failed to unmark episode" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
