// Keeps watched_episodes in sync when a title enters or leaves "completed".
// Both are best-effort: callers log a failure rather than failing the
// status change. The rules live in SQL (see the auto_complete_caught_up
// migration).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

/** Ticks every aired, not-yet-watched episode, flagged as a completion fill. */
export async function fillCompletion(
  supabase: SupabaseClient,
  titleId: string,
): Promise<{ error?: unknown }> {
  const { error } = await supabase.rpc("fill_completion", { p_title_id: titleId });
  return { error: error ?? undefined };
}

/** Undoes a completion's fill if nothing new aired since; otherwise keeps it as history. */
export async function releaseCompletion(
  supabase: SupabaseClient,
  titleId: string,
): Promise<{ error?: unknown }> {
  const { error } = await supabase.rpc("release_completion", { p_title_id: titleId });
  return { error: error ?? undefined };
}
