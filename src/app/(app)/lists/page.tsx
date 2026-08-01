import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateListForm from "@/components/CreateListForm";

// Mirrors the (untyped-client, cast-to-row-interface) pattern used across
// the other server components — no generated Database types yet.

interface ListRow {
  id: string;
  name: string;
  is_favorites: boolean;
}

interface ListTitleRow {
  list_id: string;
  title_id: string;
  titles: { poster_url: string | null } | null;
}

const THUMBNAIL_LIMIT = 4;

export default async function ListsPage() {
  const supabase = await createClient();

  const { data: listRowsData } = await supabase
    .from("lists")
    .select("id, name, is_favorites");

  const lists = (listRowsData ?? []) as ListRow[];
  const listIds = lists.map((l) => l.id);

  const counts = new Map<string, number>();
  const thumbnails = new Map<string, string[]>();

  if (listIds.length > 0) {
    const { data: membershipData } = await supabase
      .from("list_titles")
      .select("list_id, title_id, titles(poster_url)")
      .in("list_id", listIds);

    const memberships = (membershipData ?? []) as unknown as ListTitleRow[];
    for (const m of memberships) {
      counts.set(m.list_id, (counts.get(m.list_id) ?? 0) + 1);
      const posterUrl = m.titles?.poster_url;
      if (posterUrl) {
        const existing = thumbnails.get(m.list_id) ?? [];
        if (existing.length < THUMBNAIL_LIMIT) {
          existing.push(posterUrl);
          thumbnails.set(m.list_id, existing);
        }
      }
    }
  }

  const sortedLists = [...lists].sort((a, b) => {
    if (a.is_favorites !== b.is_favorites) return a.is_favorites ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="px-4 py-6 pb-6">
      <h1 className="display mb-4 text-3xl">Lists</h1>
      <CreateListForm />

      {sortedLists.length === 0 ? (
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          No lists yet — create one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sortedLists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/lists/${list.id}`}
                className="card-bold flex items-center gap-3 p-3"
              >
                <div className="flex shrink-0 -space-x-3">
                  {(thumbnails.get(list.id) ?? []).length > 0 ? (
                    thumbnails.get(list.id)!.map((url, i) => (
                      <div
                        key={i}
                        className="h-14 w-10 overflow-hidden border-[2.5px] border-ink bg-panel"
                        style={{ zIndex: THUMBNAIL_LIMIT - i }}
                      >
                        <img src={url} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))
                  ) : (
                    <div className="flex h-14 w-10 items-center justify-center border-[2.5px] border-ink bg-panel text-[9px] text-ink-soft">
                      —
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold uppercase tracking-wide">
                    {list.is_favorites && (
                      <span className="stamp text-[9px]">♥ Favorites</span>
                    )}
                    {!list.is_favorites && list.name}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {counts.get(list.id) ?? 0} title
                    {(counts.get(list.id) ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
