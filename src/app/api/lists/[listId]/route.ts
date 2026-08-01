import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";

const UNIQUE_VIOLATION = "23505";

interface ListRow {
  id: string;
  name: string;
  is_favorites: boolean;
}

interface RenameListBody {
  name?: string;
}

// PATCH /api/lists/:listId — rename a list. Body: { name }. The implicit
// Favorites list can't be renamed.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { listId } = await params;

  let body: RenameListBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabase
    .from("lists")
    .select("id, is_favorites")
    .eq("id", listId)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to look up list:", fetchError);
    return NextResponse.json({ error: "Failed to rename list" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if ((existing as ListRow).is_favorites) {
    return NextResponse.json(
      { error: "Cannot rename the Favorites list" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("lists")
    .update({ name })
    .eq("id", listId)
    .select("id, name, is_favorites")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return NextResponse.json(
        { error: "A list with that name already exists" },
        { status: 409 },
      );
    }
    console.error("Failed to rename list:", error);
    return NextResponse.json({ error: "Failed to rename list" }, { status: 500 });
  }

  const row = data as ListRow;

  return NextResponse.json({
    list: {
      id: row.id,
      name: row.name,
      isFavorites: row.is_favorites,
    },
  });
}

// DELETE /api/lists/:listId — delete a list (list_titles cascades). The
// implicit Favorites list can't be deleted.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const { listId } = await params;

  const { data: existing, error: fetchError } = await supabase
    .from("lists")
    .select("id, is_favorites")
    .eq("id", listId)
    .maybeSingle();

  if (fetchError) {
    console.error("Failed to look up list:", fetchError);
    return NextResponse.json({ error: "Failed to delete list" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  if ((existing as ListRow).is_favorites) {
    return NextResponse.json(
      { error: "Cannot delete the Favorites list" },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("lists").delete().eq("id", listId);

  if (error) {
    console.error("Failed to delete list:", error);
    return NextResponse.json({ error: "Failed to delete list" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
