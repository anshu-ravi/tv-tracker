// Snapshot of catalog rows already in the app's Supabase `titles` table, as
// supplied in the task brief. Used only to decide reuse-vs-new in the DRY
// RUN plan. At --execute time this is superseded by a live query (an
// insert-with-on-conflict-do-nothing against the real table), so this list
// never needs to be kept in perfect sync — it's a planning aid only.

export const EXISTING_TMDB_IDS = new Set<number>([
  30984, 48891, 31724, 93740, 1668, 226637, 94997, 1100, 273207, 108978,
  95396, 19885, 125988, 97546, 116799, 90282, 255661, 241609,
]);

export const EXISTING_ANILIST_IDS = new Set<number>([269, 11061, 20]);
