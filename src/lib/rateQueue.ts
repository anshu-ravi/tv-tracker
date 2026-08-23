import type { DataSource, MediaType, WatchStatus } from "@/lib/types";

// Pure queue-building logic behind the bulk rater (/account/rate), factored
// out so ordering is unit-testable without rendering the stack-of-cards UI.

export interface RateQueueItem {
  titleId: string;
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  year: number | null;
  posterUrl: string | null;
  status: WatchStatus;
  rating: number | null;
  isFavorite: boolean;
}

// Status alone ranks completed highest and dnf lowest among started titles.
// watchlist scores 0 to satisfy the Record type, but buildRateQueue drops
// watchlist items before priority ever runs. A favorite adds a boost
// independent of status -- strong enough that a favorited dnf or watching
// title outranks a plain completed one.
const STATUS_ENGAGEMENT: Record<WatchStatus, number> = {
  completed: 3,
  watching: 2,
  dnf: 1,
  watchlist: 0,
};
const FAVORITE_BOOST = 3;

function priority(item: RateQueueItem): number {
  return STATUS_ENGAGEMENT[item.status] + (item.isFavorite ? FAVORITE_BOOST : 0);
}

// Filters to started titles (excludes watchlist -- nothing to rate if you
// haven't watched it) that are still unrated, ordered most-engaged first, so
// the ratings most useful to the recommendation engine (see seedWeight in
// lib/recommendations.ts) get collected before the owner's attention runs
// out. Ties break alphabetically by title for a stable order across reloads.
export function buildRateQueue(items: RateQueueItem[]): RateQueueItem[] {
  return items
    .filter((item) => item.rating == null && item.status !== "watchlist")
    .sort((a, b) => priority(b) - priority(a) || a.title.localeCompare(b.title));
}
