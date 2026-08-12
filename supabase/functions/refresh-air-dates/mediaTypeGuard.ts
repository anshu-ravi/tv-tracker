// Pure, dependency-free predicate — no Deno-specific APIs, no `npm:`
// imports, no top-level env reads — so it can be imported both by
// index.ts (Deno) and by a Vitest test under Node (see
// tests/lib/refreshAirDatesGuard.test.ts), unlike the rest of this
// function's code, which can't be imported outside Deno (see index.ts's
// top comment).
//
// WHY: movies have no episodes/next-episode-air-date concept — a movie's
// watched-state is a single synthetic NULL-coordinate episodes row (see
// supabase/migrations/20260812090000_movies_synthetic_episode.sql), which
// this nightly TMDB sweep must never touch. Routing a movie through
// refreshTvTitle would call /tv/{id} against a TMDB movie id (wrong
// endpoint entirely) and, on some other id colliding with a real TV show,
// could upsert bogus season/episode rows onto a movie's title_id. Keep this
// check trivial and isolated given this function's history of destructive
// bugs (see HANDOFF.md) — one obviously-correct boolean, tested directly.
export type SweepableMediaType = "tv" | "anime" | "movie";

export function shouldSkipRefresh(mediaType: SweepableMediaType): boolean {
  return mediaType === "movie";
}
