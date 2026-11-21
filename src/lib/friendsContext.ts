import { toRating } from "@/lib/friendProfile";
import type { DataSource, MediaType, SearchResult, WatchStatus } from "@/lib/types";

/** A row from the `friends_on_title` RPC. */
export interface FriendOnTitleRow {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  status: WatchStatus;
  rating: number | string | null;
  watched_count: number;
}

/** A row from the `friends_loved` RPC. */
export interface FriendsLovedRow {
  title_id: string;
  title: string;
  poster_url: string | null;
  media_type: MediaType;
  source: DataSource;
  source_id: string;
  first_air_date: string | null;
  best_rating: number | string | null;
  friend_count: number;
  friend_names: string[];
}

const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: "Watching",
  watchlist: "Watchlist",
  completed: "Completed",
  dnf: "Dropped",
};

/** "Completed · 73 eps" style summary of a friend's take on one title. */
export function friendStatusLabel(row: FriendOnTitleRow, isMovie: boolean): string {
  const label = STATUS_LABEL[row.status];
  if (isMovie || row.status === "watchlist" || row.watched_count === 0) return label;
  return `${label} · ${row.watched_count} ep${row.watched_count === 1 ? "" : "s"}`;
}

/** "Andres ★ 4.5", "Andres & Ravi ★ 4.5", or "♥ Andres" for an unrated favorite. */
export function lovedNote(row: FriendsLovedRow): string {
  const names = row.friend_names;
  const who =
    names.length <= 2 ? names.join(" & ") : `${names[0]} +${names.length - 1}`;
  const rating = toRating(row.best_rating);
  return rating === null ? `♥ ${who}` : `${who} ★ ${rating.toFixed(1)}`;
}

export function toLovedResult(row: FriendsLovedRow): SearchResult {
  return {
    source: row.source,
    sourceId: row.source_id,
    mediaType: row.media_type,
    title: row.title,
    year: row.first_air_date ? Number(row.first_air_date.slice(0, 4)) : null,
    posterUrl: row.poster_url,
    note: lovedNote(row),
  };
}
