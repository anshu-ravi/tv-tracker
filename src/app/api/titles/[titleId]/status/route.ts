import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { markTitleWatched, unmarkTitleWatched } from "@/lib/api/watched";
import type { WatchStatus } from "@/lib/types";

const WATCH_STATUSES: WatchStatus[] = [
  "watchlist",
  "watching",
  "completed",
  "dnf",
];

interface SetStatusBody {
  status?: WatchStatus;
}

// PATCH /api/titles/:titleId/status — move a title between buckets. Body:
// { status }. Only touches the caller's own user_titles row (RLS also
// enforces this, but we filter on user_id too so a missing row 404s cleanly
// instead of silently updating zero rows).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ titleId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const { titleId } = await params;

  let body: SetStatusBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status } = body;
  if (!status || !WATCH_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of ${WATCH_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  // Movies have no "watching" bucket (see CLAUDE.md's movies product
  // decision) — POST /api/titles rejects this on add, but a title already
  // in the catalog can also be moved between buckets here, so the same rule
  // has to be enforced on this path too, not just at add-time.
  if (status === "watching") {
    const { data: titleRow, error: titleLookupError } = await supabase
      .from("titles")
      .select("media_type")
      .eq("id", titleId)
      .maybeSingle();

    if (titleLookupError) {
      console.error("Failed to look up title media_type:", titleLookupError);
      return NextResponse.json(
        { error: "Failed to update status" },
        { status: 500 },
      );
    }

    if (titleRow?.media_type === "movie") {
      return NextResponse.json(
        { error: "Movies cannot be added to Watching" },
        { status: 400 },
      );
    }
  }

  // Look up the current status first so we know whether this change is
  // entering or leaving "completed" (drives the watched_episodes sync below).
  const { data: current, error: currentError } = await supabase
    .from("user_titles")
    .select("status")
    .eq("title_id", titleId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (currentError) {
    console.error("Failed to look up current status:", currentError);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 },
    );
  }

  const previousStatus = current?.status as WatchStatus | undefined;

  const { data, error } = await supabase
    .from("user_titles")
    .update({ status })
    .eq("title_id", titleId)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to update status:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Title is not in your list" },
      { status: 404 },
    );
  }

  // Keep watched_episodes in sync with the "completed" bucket. Best-effort:
  // the status change above already succeeded, so a sync failure here is
  // logged and swallowed rather than failing the request.
  if (status === "completed") {
    const { error: syncError } = await markTitleWatched(supabase, titleId);
    if (syncError) {
      console.error("Failed to mark episodes watched on completion:", syncError);
    }
  } else if (previousStatus === "completed") {
    const { error: syncError } = await unmarkTitleWatched(supabase, titleId);
    if (syncError) {
      console.error("Failed to unmark episodes on leaving completed:", syncError);
    }
  }

  return NextResponse.json({ userTitle: data });
}
