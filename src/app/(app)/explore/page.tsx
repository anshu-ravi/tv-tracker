import { createClient } from "@/lib/supabase/server";
import ExploreClient from "@/components/ExploreClient";
import { toLovedResult, type FriendsLovedRow } from "@/lib/friendsContext";
import { titleKey, type DataSource, type ExistingLibraryEntry, type MediaType, type WatchStatus } from "@/lib/types";

interface TitleRow {
  id: string;
  source: DataSource;
  source_id: string;
  media_type: MediaType;
}

interface UserTitleRow {
  status: WatchStatus;
  titles: TitleRow | null;
}

export default async function ExplorePage() {
  const supabase = await createClient();

  // Pull the caller's whole library (id, source, source_id, status) up front
  // so ExploreClient can flag "already in your library" — and link to its
  // detail page — without a round trip per result.
  const [{ data, error }, { data: lovedData, error: lovedError }] = await Promise.all([
    supabase.from("user_titles").select("status, titles(id, source, source_id, media_type)"),
    supabase.rpc("friends_loved", { p_limit: 20 }),
  ]);

  if (error) throw error;
  // The friends rail is optional; never let it blank the Explore screen.
  if (lovedError) console.warn("Failed to load friends loved:", lovedError.message);
  const friendsLoved = ((lovedError ? [] : lovedData ?? []) as FriendsLovedRow[]).map(toLovedResult);

  const rows = (data ?? []) as unknown as UserTitleRow[];

  const existing: Record<string, ExistingLibraryEntry> = {};
  for (const row of rows) {
    if (!row.titles) continue;
    const key = titleKey(row.titles.source, row.titles.source_id, row.titles.media_type);
    existing[key] = {
      status: row.status,
      titleId: row.titles.id,
    };
  }

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Explore</h1>
      <ExploreClient existing={existing} friendsLoved={friendsLoved} />
    </div>
  );
}
