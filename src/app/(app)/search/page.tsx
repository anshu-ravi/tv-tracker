import { createClient } from "@/lib/supabase/server";
import SearchClient from "@/components/SearchClient";
import type { DataSource, WatchStatus } from "@/lib/types";

interface TitleRow {
  source: DataSource;
  source_id: string;
}

interface UserTitleRow {
  status: WatchStatus;
  titles: TitleRow | null;
}

export default async function SearchPage() {
  const supabase = await createClient();

  // Pull the caller's whole library (source, source_id, status) up front so
  // SearchClient can flag "already in your library" without a round trip per
  // result.
  const { data } = await supabase
    .from("user_titles")
    .select("status, titles(source, source_id)");

  const rows = (data ?? []) as unknown as UserTitleRow[];

  const existing: Record<string, WatchStatus> = {};
  for (const row of rows) {
    if (!row.titles) continue;
    existing[`${row.titles.source}:${row.titles.source_id}`] = row.status;
  }

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Search</h1>
      <SearchClient existing={existing} />
    </div>
  );
}
