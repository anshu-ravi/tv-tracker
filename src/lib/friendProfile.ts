import type { DataSource, MediaType, WatchStatus } from "@/lib/types";

/** A row from the `friend_library` RPC. */
export interface FriendLibraryRow {
  title_id: string;
  title: string;
  poster_url: string | null;
  media_type: MediaType;
  source: DataSource;
  source_id: string;
  is_running: boolean;
  status: WatchStatus;
  rating: number | string | null;
  updated_at: string;
  completed_at: string | null;
  watched_count: number;
  aired_count: number;
  last_season: number | null;
  last_episode: number | null;
}

/** A row from the `friend_lists` RPC; title fields are null for an empty list. */
export interface FriendListRow {
  list_id: string;
  list_name: string;
  is_favorites: boolean;
  title_id: string | null;
  title: string | null;
  poster_url: string | null;
  media_type: MediaType | null;
  source: DataSource | null;
  source_id: string | null;
}

/** What a friend-profile card needs, independent of which RPC it came from. */
export interface FriendCardTitle {
  id: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  source: DataSource;
  sourceId: string;
  rating: number | null;
  progress: string | null;
}

export interface FriendList {
  id: string;
  name: string;
  isFavorites: boolean;
  titles: FriendCardTitle[];
}

export type ProfileTab = "top" | "library" | "lists" | "compare";
export type MediaFilter = "all" | MediaType;

export const PROFILE_TABS: { value: ProfileTab; label: string }[] = [
  { value: "top", label: "Top rated" },
  { value: "library", label: "Library" },
  { value: "lists", label: "Lists" },
  { value: "compare", label: "Compare" },
];

export const MEDIA_FILTERS: { value: MediaFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "movie", label: "Movies" },
];

export function parseTab(raw: unknown): ProfileTab {
  return PROFILE_TABS.some((t) => t.value === raw) ? (raw as ProfileTab) : "top";
}

export function parseMediaFilter(raw: unknown): MediaFilter {
  return MEDIA_FILTERS.some((f) => f.value === raw) ? (raw as MediaFilter) : "all";
}

/** PostgREST returns numeric columns as strings; normalize to a number or null. */
export function toRating(raw: number | string | null): number | null {
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** "S2E5 · 22/26" for a show in progress; null for movies or nothing watched. */
export function progressLabel(row: FriendLibraryRow): string | null {
  if (row.media_type === "movie" || row.watched_count === 0) return null;
  const last =
    row.last_season && row.last_episode ? `S${row.last_season}E${row.last_episode}` : null;
  const count = row.aired_count > 0 ? `${row.watched_count}/${row.aired_count}` : `${row.watched_count} eps`;
  return last ? `${last} · ${count}` : count;
}

export function toCard(row: FriendLibraryRow): FriendCardTitle {
  return {
    id: row.title_id,
    title: row.title,
    posterUrl: row.poster_url,
    mediaType: row.media_type,
    source: row.source,
    sourceId: row.source_id,
    rating: toRating(row.rating),
    progress: row.status === "watching" ? progressLabel(row) : null,
  };
}

export function filterByMedia<T extends { media_type: MediaType | null }>(
  rows: T[],
  filter: MediaFilter,
): T[] {
  return filter === "all" ? rows : rows.filter((r) => r.media_type === filter);
}

/** Rated titles, highest first; ties broken by most recently updated. */
export function topRated(rows: FriendLibraryRow[]): FriendLibraryRow[] {
  return rows
    .filter((r) => toRating(r.rating) !== null)
    .sort(
      (a, b) =>
        (toRating(b.rating) ?? 0) - (toRating(a.rating) ?? 0) ||
        b.updated_at.localeCompare(a.updated_at),
    );
}

/** Groups by status; within a bucket, most recently updated first. */
export function groupByStatus(rows: FriendLibraryRow[]): Record<WatchStatus, FriendLibraryRow[]> {
  const out: Record<WatchStatus, FriendLibraryRow[]> = {
    watching: [],
    watchlist: [],
    completed: [],
    dnf: [],
  };
  for (const row of rows) out[row.status].push(row);
  for (const bucket of Object.values(out)) {
    bucket.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  return out;
}

/** Folds `friend_lists` rows into lists, keeping the RPC's order (Favorites first). */
export function groupLists(rows: FriendListRow[], filter: MediaFilter = "all"): FriendList[] {
  const lists = new Map<string, FriendList>();
  for (const row of rows) {
    let list = lists.get(row.list_id);
    if (!list) {
      list = { id: row.list_id, name: row.list_name, isFavorites: row.is_favorites, titles: [] };
      lists.set(row.list_id, list);
    }
    if (!row.title_id || !row.title || !row.media_type || !row.source || !row.source_id) continue;
    if (filter !== "all" && row.media_type !== filter) continue;
    list.titles.push({
      id: row.title_id,
      title: row.title,
      posterUrl: row.poster_url,
      mediaType: row.media_type,
      source: row.source,
      sourceId: row.source_id,
      rating: null,
      progress: null,
    });
  }
  return [...lists.values()];
}

export function profileCounts(rows: FriendLibraryRow[]) {
  return {
    completed: rows.filter((r) => r.status === "completed").length,
    watching: rows.filter((r) => r.status === "watching").length,
    rated: rows.filter((r) => toRating(r.rating) !== null).length,
  };
}
