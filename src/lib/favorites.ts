// Read-only helper for server components that need to know "which of these
// titles are favorited" in one shot (poster grids), rather than each card
// re-deriving it from its own `/api/lists?titleId=` fetch. Unlike
// `getOrCreateFavoritesList` (src/lib/api/lists.ts, used by mutation
// routes), this never creates the Favorites list — a user who has never
// favorited anything simply has no favorites list yet, and every title is
// correctly "not favorited".
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export async function getFavoriteTitleIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data: favList, error: listError } = await supabase
    .from("lists")
    .select("id")
    .eq("is_favorites", true)
    .maybeSingle();

  if (listError || !favList) return new Set();

  const { data: memberRows, error: memberError } = await supabase
    .from("list_titles")
    .select("title_id")
    .eq("list_id", favList.id);

  if (memberError) return new Set();

  return new Set(((memberRows ?? []) as { title_id: string }[]).map((r) => r.title_id));
}
