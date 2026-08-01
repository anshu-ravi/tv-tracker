import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/BackButton";
import ListDetailControls from "@/components/ListDetailControls";
import ListTitleCard from "@/components/ListTitleCard";
import type { PosterCardTitle } from "@/components/PosterCard";
import type { MediaType } from "@/lib/types";

interface ListRow {
  id: string;
  name: string;
  is_favorites: boolean;
}

interface ListTitleRow {
  title_id: string;
  titles: {
    id: string;
    title: string;
    poster_url: string | null;
    media_type: MediaType;
  } | null;
}

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const { listId } = await params;
  const supabase = await createClient();

  // RLS scopes `lists` to the caller's own rows, so a listId belonging to
  // someone else (impossible today, single-user, but future-proof) or a
  // bogus id both come back empty here — either way, 404.
  const { data: listData } = await supabase
    .from("lists")
    .select("id, name, is_favorites")
    .eq("id", listId)
    .maybeSingle();

  const list = listData as ListRow | null;
  if (!list) notFound();

  const { data: titlesData } = await supabase
    .from("list_titles")
    .select("title_id, titles(id, title, poster_url, media_type)")
    .eq("list_id", listId);

  const rows = (titlesData ?? []) as unknown as ListTitleRow[];
  const titles: PosterCardTitle[] = rows
    .filter((r) => r.titles)
    .map((r) => ({
      id: r.titles!.id,
      title: r.titles!.title,
      posterUrl: r.titles!.poster_url,
      mediaType: r.titles!.media_type,
    }));

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between gap-2 px-4 pt-6">
        <BackButton />
      </div>

      <div className="px-4 pt-4">
        <h1 className="display flex items-center gap-2 text-3xl">
          {list.is_favorites && <span className="stamp text-xs">♥</span>}
          {list.name}
        </h1>
        <p className="mt-1 text-xs text-ink-soft">
          {titles.length} title{titles.length === 1 ? "" : "s"}
        </p>

        {!list.is_favorites && (
          <div className="mt-3">
            <ListDetailControls listId={list.id} name={list.name} />
          </div>
        )}
      </div>

      <div className="px-4 pt-5">
        {titles.length === 0 ? (
          <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
            Nothing in this list yet.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {titles.map((title) => (
              <ListTitleCard key={title.id} listId={list.id} title={title} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
