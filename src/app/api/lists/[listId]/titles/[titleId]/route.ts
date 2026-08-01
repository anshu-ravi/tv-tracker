import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

// DELETE /api/lists/:listId/titles/:titleId — remove a title from a list.
// RLS (joined through the parent list's owner) plus the list_id/title_id
// filter scope this to the caller's own membership row.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string; titleId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { listId, titleId } = await params;

  const { error } = await supabase
    .from("list_titles")
    .delete()
    .eq("list_id", listId)
    .eq("title_id", titleId);

  if (error) {
    console.error("Failed to remove title from list:", error);
    return NextResponse.json(
      { error: "Failed to remove title from list" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
