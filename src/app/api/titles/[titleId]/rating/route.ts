import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

interface SetRatingBody {
  rating?: number | null;
}

const RATING_MIN = 0.5;
const RATING_MAX = 5.0;

// Matches the DB check constraint (user_titles_rating_range) and the
// numeric(2,1) column -- null or a half-open 0.5-5.0 value on a 0.1 grid.
// Validated here too so a bad value 400s instead of letting Postgres'
// constraint turn it into a 500.
function isValidRating(rating: unknown): rating is number {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return false;
  if (rating < RATING_MIN || rating > RATING_MAX) return false;
  // Round-trip through tenths to sidestep float error (e.g. 4.5 * 10 !== 45 exactly).
  const tenths = Math.round(rating * 10);
  return Math.abs(rating * 10 - tenths) < 1e-9;
}

// PATCH /api/titles/:titleId/rating — set or clear the owner's own rating
// on a tracked title. Body: { rating: number | null }. Only touches the
// caller's own user_titles row (RLS also enforces this, but we filter on
// user_id too so a missing row 404s cleanly instead of updating zero rows).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ titleId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  const { titleId } = await params;

  let body: SetRatingBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { rating } = body;
  if (rating !== null && !isValidRating(rating)) {
    return NextResponse.json(
      { error: "rating must be null or a multiple of 0.1 between 0.5 and 5.0" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("user_titles")
    .update({ rating })
    .eq("title_id", titleId)
    .eq("user_id", user.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("Failed to update rating:", error);
    return NextResponse.json({ error: "Failed to update rating" }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Title is not in your list" }, { status: 404 });
  }

  return NextResponse.json({ userTitle: data });
}
