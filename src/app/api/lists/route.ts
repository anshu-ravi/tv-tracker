import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/auth";
import type { ListSummary } from "@/lib/types";

const UNIQUE_VIOLATION = "23505";

interface ListRow {
  id: string;
  name: string;
  is_favorites: boolean;
}

interface ListTitleRow {
  list_id: string;
  title_id: string;
}

// GET /api/lists — the caller's lists (favorites first, then alphabetical),
// each with its title count. Pass ?titleId=<uuid> to also get a `contains`
// flag per list for that title (used by "add to list" pickers). Favorites
// is never lazily created here — if the user has never favorited anything,
// it's simply absent from the response.
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  const titleId = request.nextUrl.searchParams.get("titleId");

  const { data: listRows, error: listsError } = await supabase
    .from("lists")
    .select("id, name, is_favorites");

  if (listsError) {
    console.error("Failed to load lists:", listsError);
    return NextResponse.json({ error: "Failed to load lists" }, { status: 500 });
  }

  const lists = (listRows ?? []) as ListRow[];

  if (lists.length === 0) {
    return NextResponse.json({ lists: [] });
  }

  const listIds = lists.map((l) => l.id);

  const { data: membershipRows, error: membershipError } = await supabase
    .from("list_titles")
    .select("list_id, title_id")
    .in("list_id", listIds);

  if (membershipError) {
    console.error("Failed to load list memberships:", membershipError);
    return NextResponse.json({ error: "Failed to load lists" }, { status: 500 });
  }

  const memberships = (membershipRows ?? []) as ListTitleRow[];

  const counts = new Map<string, number>();
  const containsByList = new Map<string, boolean>();
  for (const m of memberships) {
    counts.set(m.list_id, (counts.get(m.list_id) ?? 0) + 1);
    if (titleId && m.title_id === titleId) {
      containsByList.set(m.list_id, true);
    }
  }

  const summaries: ListSummary[] = lists
    .map((l) => ({
      id: l.id,
      name: l.name,
      isFavorites: l.is_favorites,
      titleCount: counts.get(l.id) ?? 0,
      ...(titleId ? { contains: containsByList.get(l.id) ?? false } : {}),
    }))
    .sort((a, b) => {
      if (a.isFavorites !== b.isFavorites) return a.isFavorites ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({ lists: summaries });
}

interface CreateListBody {
  name?: string;
}

// POST /api/lists — create a new (non-favorites) list. Body: { name }.
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { supabase } = auth;

  let body: CreateListBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lists")
    .insert({ name })
    .select("id, name, is_favorites")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return NextResponse.json(
        { error: "A list with that name already exists" },
        { status: 409 },
      );
    }
    console.error("Failed to create list:", error);
    return NextResponse.json({ error: "Failed to create list" }, { status: 500 });
  }

  const row = data as ListRow;

  return NextResponse.json(
    {
      list: {
        id: row.id,
        name: row.name,
        isFavorites: row.is_favorites,
        titleCount: 0,
      },
    },
    { status: 201 },
  );
}
