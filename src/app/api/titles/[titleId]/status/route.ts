import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
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

  return NextResponse.json({ userTitle: data });
}
