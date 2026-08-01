import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import { ensureCatalogTitle } from "@/lib/api/catalog";
import type { DataSource, MediaType } from "@/lib/types";

interface AddTitleToListBody {
  titleId?: string;
  source?: DataSource;
  sourceId?: string;
  mediaType?: MediaType;
}

// POST /api/lists/:listId/titles — add a title to a list. Body is either
// { titleId } for an already-catalogued title, or { source, sourceId,
// mediaType } to resolve/create the catalog row first. Idempotent: adding a
// title already in the list is a no-op.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { listId } = await params;

  let body: AddTitleToListBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: list, error: listError } = await supabase
    .from("lists")
    .select("id")
    .eq("id", listId)
    .maybeSingle();

  if (listError) {
    console.error("Failed to look up list:", listError);
    return NextResponse.json({ error: "Failed to add title to list" }, { status: 500 });
  }
  if (!list) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }

  let titleId = body.titleId;
  if (!titleId) {
    const catalogResult = await ensureCatalogTitle(supabase, {
      source: body.source,
      sourceId: body.sourceId,
      mediaType: body.mediaType,
    });

    if ("error" in catalogResult) {
      return NextResponse.json(
        { error: catalogResult.error },
        { status: catalogResult.status },
      );
    }

    titleId = catalogResult.titleId;
  }

  const { error } = await supabase
    .from("list_titles")
    .upsert(
      { list_id: listId, title_id: titleId },
      { onConflict: "list_id,title_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error("Failed to add title to list:", error);
    return NextResponse.json({ error: "Failed to add title to list" }, { status: 500 });
  }

  return NextResponse.json({ titleId }, { status: 201 });
}
