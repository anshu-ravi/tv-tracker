import { createClient } from "@/lib/supabase/server";
import SearchClient from "@/components/SearchClient";
import type { DataSource, WatchStatus } from "@/lib/types";

interface TitleRow {
  id: string;
  source: DataSource;
  source_id: string;
}

interface UserTitleRow {
  status: WatchStatus;
  titles: TitleRow | null;
}

export interface ExistingLibraryEntry {
  status: WatchStatus;
  titleId: string;
}

export default async function SearchPage() {
  const supabase = await createClient();

  // Pull the caller's whole library (id, source, source_id, status) up front
  // so SearchClient can flag "already in your library" — and link to its
  // detail page — without a round trip per result.
  const { data, error } = await supabase
    .from("user_titles")
    .select("status, titles(id, source, source_id)");

  if (error) throw error;

  const rows = (data ?? []) as unknown as UserTitleRow[];

  const existing: Record<string, ExistingLibraryEntry> = {};
  for (const row of rows) {
    if (!row.titles) continue;
    existing[`${row.titles.source}:${row.titles.source_id}`] = {
      status: row.status,
      titleId: row.titles.id,
    };
  }

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Search</h1>
      <SearchClient existing={existing} />
    </div>
  );
}
