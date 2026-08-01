// Favorites is just a lists row with is_favorites=true — this resolves (or
// lazily creates) the caller's single favorites list. A partial unique index
// on lists(user_id) WHERE is_favorites guards against two favorites lists,
// so a race between two concurrent "favorite this title" requests is
// resolved by re-selecting on a unique-violation instead of erroring.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

const UNIQUE_VIOLATION = "23505";

export type GetOrCreateFavoritesListResult =
  | { listId: string }
  | { error: string; status: number };

export async function getOrCreateFavoritesList(
  supabase: SupabaseClient,
): Promise<GetOrCreateFavoritesListResult> {
  const { data: existing, error: selectError } = await supabase
    .from("lists")
    .select("id")
    .eq("is_favorites", true)
    .maybeSingle();

  if (selectError) {
    console.error("Failed to look up favorites list:", selectError);
    return { error: "Failed to look up favorites list", status: 500 };
  }

  if (existing) {
    return { listId: existing.id as string };
  }

  const { data: created, error: insertError } = await supabase
    .from("lists")
    .insert({ name: "Favorites", is_favorites: true })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      // Lost the race to another request — the row now exists, re-select it.
      const { data: raced, error: racedError } = await supabase
        .from("lists")
        .select("id")
        .eq("is_favorites", true)
        .maybeSingle();

      if (racedError || !raced) {
        console.error("Failed to re-select favorites list after race:", racedError);
        return { error: "Failed to create favorites list", status: 500 };
      }

      return { listId: raced.id as string };
    }

    console.error("Failed to create favorites list:", insertError);
    return { error: "Failed to create favorites list", status: 500 };
  }

  if (!created) {
    return { error: "Failed to create favorites list", status: 500 };
  }

  return { listId: created.id as string };
}
