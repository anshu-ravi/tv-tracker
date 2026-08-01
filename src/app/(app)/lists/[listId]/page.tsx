import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/components/BackButton";
import ListDetailControls from "@/components/ListDetailControls";
import ListTitlesView from "@/components/ListTitlesView";
import AddToListPicker, { type AddToListCandidate } from "@/components/AddToListPicker";
import type { PosterCardTitle } from "@/components/PosterCard";
import type { DataSource, MediaType } from "@/lib/types";

interface ListRow {
  id: string;
  name: string;
  is_favorites: boolean;
}

interface CatalogTitleRow {
  id: string;
  title: string;
  poster_url: string | null;
  media_type: MediaType;
  source: DataSource;
  source_id: string;
}

interface ListTitleRow {
  title_id: string;
  titles: CatalogTitleRow | null;
}

interface UserTitleRow {
  titles: CatalogTitleRow | null;
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

  // The list's own members, and (in parallel) the user's whole tracked
  // library — the latter is the candidate pool for "＋ Add shows" once
  // members already in this list are filtered out below.
  const [{ data: titlesData }, { data: libraryData }] = await Promise.all([
    supabase
      .from("list_titles")
      .select("title_id, titles(id, title, poster_url, media_type, source, source_id)")
      .eq("list_id", listId),
    supabase
      .from("user_titles")
      .select("titles(id, title, poster_url, media_type, source, source_id)"),
  ]);

  const rows = (titlesData ?? []) as unknown as ListTitleRow[];
  const titles: PosterCardTitle[] = rows
    .filter((r) => r.titles)
    .map((r) => ({
      id: r.titles!.id,
      title: r.titles!.title,
      posterUrl: r.titles!.poster_url,
      mediaType: r.titles!.media_type,
      source: r.titles!.source,
      sourceId: r.titles!.source_id,
    }));

  const memberIds = new Set(titles.map((t) => t.id));
  const libraryRows = (libraryData ?? []) as unknown as UserTitleRow[];
  // De-dupe by title id — a title tracked once still only needs to appear
  // once in the picker even though user_titles is one row per title anyway.
  const candidatesById = new Map<string, AddToListCandidate>();
  for (const row of libraryRows) {
    if (!row.titles || memberIds.has(row.titles.id)) continue;
    candidatesById.set(row.titles.id, {
      id: row.titles.id,
      title: row.titles.title,
      posterUrl: row.titles.poster_url,
    });
  }
  const candidates = Array.from(candidatesById.values());

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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <AddToListPicker listId={list.id} candidates={candidates} />
          {!list.is_favorites && <ListDetailControls listId={list.id} name={list.name} />}
        </div>
      </div>

      <div className="px-4 pt-5">
        <ListTitlesView listId={list.id} titles={titles} />
      </div>
    </div>
  );
}
