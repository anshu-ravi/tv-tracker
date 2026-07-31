import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

// DELETE /api/titles/:titleId — remove a title from the caller's library.
// Only the caller's tracking rows are deleted (watched_episodes, then
// user_titles); the shared catalog rows (titles/episodes) are left intact
// since other users/future adds may still reference them.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ titleId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const { titleId } = await params;

  const { error: watchedError } = await supabase
    .from("watched_episodes")
    .delete()
    .eq("title_id", titleId)
    .eq("user_id", user.id);

  if (watchedError) {
    console.error("Failed to remove watched episodes:", watchedError);
    return NextResponse.json(
      { error: "Failed to remove title" },
      { status: 500 },
    );
  }

  const { error: userTitleError } = await supabase
    .from("user_titles")
    .delete()
    .eq("title_id", titleId)
    .eq("user_id", user.id);

  if (userTitleError) {
    console.error("Failed to remove user_titles row:", userTitleError);
    return NextResponse.json(
      { error: "Failed to remove title" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
