// Keeps watched_episodes in sync when a title's bucket status flips to/from
// "completed". Marking completed fills in every episode as watched (so
// progress counters read as fully caught up); leaving completed clears them
// back out. Both are best-effort from the caller's perspective — the status
// change itself is the source of truth, so a sync failure is logged and
// swallowed rather than failing the request.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export async function markTitleWatched(
  supabase: SupabaseClient,
  titleId: string,
): Promise<{ error?: unknown }> {
  const { data: episodes, error: episodesError } = await supabase
    .from("episodes")
    .select("id")
    .eq("title_id", titleId);

  if (episodesError) {
    return { error: episodesError };
  }

  const episodeIds = (episodes ?? []).map((e: { id: string }) => e.id);
  if (episodeIds.length === 0) {
    return {};
  }

  // Unique on (user_id, episode_id); ignoreDuplicates makes re-marking an
  // already-watched episode a no-op. user_id is left out so the column
  // default (auth.uid()) applies.
  const { error } = await supabase.from("watched_episodes").upsert(
    episodeIds.map((episodeId: string) => ({
      episode_id: episodeId,
      title_id: titleId,
    })),
    { onConflict: "user_id,episode_id", ignoreDuplicates: true },
  );

  return { error: error ?? undefined };
}

export async function unmarkTitleWatched(
  supabase: SupabaseClient,
  titleId: string,
): Promise<{ error?: unknown }> {
  const { error } = await supabase
    .from("watched_episodes")
    .delete()
    .eq("title_id", titleId);

  return { error: error ?? undefined };
}
