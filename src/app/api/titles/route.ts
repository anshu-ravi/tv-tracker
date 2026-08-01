import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ensureCatalogTitle } from "@/lib/api/catalog";
import { markTitleWatched } from "@/lib/api/watched";
import type { DataSource, MediaType, WatchStatus } from "@/lib/types";

const WATCH_STATUSES: WatchStatus[] = [
  "watchlist",
  "watching",
  "completed",
  "dnf",
];

interface AddTitleBody {
  source?: DataSource;
  sourceId?: string;
  mediaType?: MediaType;
  status?: WatchStatus;
}

// POST /api/titles — add a title to a bucket. Body: { source, sourceId,
// mediaType, status }. Ensures the shared catalog rows (titles + episodes)
// exist via ensureCatalogTitle, then upserts the caller's user_titles row
// with the chosen status.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase, user } = auth;

  let body: AddTitleBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { source, sourceId, mediaType, status } = body;

  if (!sourceId || !status || !WATCH_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: "source, sourceId, mediaType, and a valid status are required" },
      { status: 400 },
    );
  }

  const catalogResult = await ensureCatalogTitle(supabase, {
    source,
    sourceId,
    mediaType,
  });

  if ("error" in catalogResult) {
    return NextResponse.json(
      { error: catalogResult.error },
      { status: catalogResult.status },
    );
  }

  const { titleId } = catalogResult;

  // Upsert the caller's bucket for this title (unique on user_id, title_id).
  // user_id is left out of the payload so the column default (auth.uid())
  // applies — RLS requires it to match the signed-in user anyway.
  const { data: userTitle, error: userTitleError } = await supabase
    .from("user_titles")
    .upsert(
      { title_id: titleId, status },
      { onConflict: "user_id,title_id" },
    )
    .select()
    .single();

  if (userTitleError || !userTitle) {
    console.error("Failed to upsert user_title:", userTitleError);
    return NextResponse.json(
      { error: "Failed to update bucket" },
      { status: 500 },
    );
  }

  if (status === "completed") {
    const { error: syncError } = await markTitleWatched(supabase, titleId);
    if (syncError) {
      console.error("Failed to sync watched episodes on add:", syncError);
    }
  }

  return NextResponse.json(
    { titleId, userTitle, userId: user.id },
    { status: 201 },
  );
}
