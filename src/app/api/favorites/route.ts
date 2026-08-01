import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ensureCatalogTitle } from "@/lib/api/catalog";
import { getOrCreateFavoritesList } from "@/lib/api/lists";
import type { DataSource, MediaType } from "@/lib/types";

interface FavoriteBody {
  titleId?: string;
  source?: DataSource;
  sourceId?: string;
  mediaType?: MediaType;
}

async function resolveTitleId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  body: FavoriteBody,
): Promise<{ titleId: string } | { error: string; status: number }> {
  if (body.titleId) {
    return { titleId: body.titleId };
  }
  return ensureCatalogTitle(supabase, {
    source: body.source,
    sourceId: body.sourceId,
    mediaType: body.mediaType,
  });
}

// POST /api/favorites — add a title to the (lazily-created) Favorites list.
// Body is either { titleId } or { source, sourceId, mediaType }. Idempotent.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let body: FavoriteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const titleResult = await resolveTitleId(supabase, body);
  if ("error" in titleResult) {
    return NextResponse.json(
      { error: titleResult.error },
      { status: titleResult.status },
    );
  }
  const { titleId } = titleResult;

  const favoritesResult = await getOrCreateFavoritesList(supabase);
  if ("error" in favoritesResult) {
    return NextResponse.json(
      { error: favoritesResult.error },
      { status: favoritesResult.status },
    );
  }
  const { listId } = favoritesResult;

  const { error } = await supabase
    .from("list_titles")
    .upsert(
      { list_id: listId, title_id: titleId },
      { onConflict: "list_id,title_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error("Failed to favorite title:", error);
    return NextResponse.json({ error: "Failed to favorite title" }, { status: 500 });
  }

  return NextResponse.json({ titleId, favorited: true }, { status: 201 });
}

interface UnfavoriteRow {
  id: string;
}

// DELETE /api/favorites — remove a title from Favorites. Accepts titleId via
// ?titleId= query param or a JSON body { titleId }. If the caller has no
// Favorites list at all, there's nothing to remove.
export async function DELETE(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let titleId = request.nextUrl.searchParams.get("titleId");

  if (!titleId) {
    let body: FavoriteBody = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    titleId = body.titleId ?? null;
  }

  if (!titleId) {
    return NextResponse.json({ error: "titleId is required" }, { status: 400 });
  }

  const { data: list, error: listError } = await supabase
    .from("lists")
    .select("id")
    .eq("is_favorites", true)
    .maybeSingle();

  if (listError) {
    console.error("Failed to look up favorites list:", listError);
    return NextResponse.json({ error: "Failed to unfavorite title" }, { status: 500 });
  }

  if (!list) {
    return NextResponse.json({ favorited: false });
  }

  const { error } = await supabase
    .from("list_titles")
    .delete()
    .eq("list_id", (list as UnfavoriteRow).id)
    .eq("title_id", titleId);

  if (error) {
    console.error("Failed to unfavorite title:", error);
    return NextResponse.json({ error: "Failed to unfavorite title" }, { status: 500 });
  }

  return NextResponse.json({ favorited: false });
}
