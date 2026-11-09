import type { MediaType } from "@/lib/types";

// Filters, sorts and ranks the caller's rated titles for /account/ratings.

export type RatingSort = "desc" | "asc";
export type RatingFilter = "all" | MediaType;

export interface RatedTitle {
  titleId: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  rating: number;
}

export interface RankedTitle extends RatedTitle {
  rank: number;
}

// Equal ratings share a rank ("1, 2, 2, 4"), ties ordered alphabetically.
export function rankRatings(
  items: RatedTitle[],
  filter: RatingFilter,
  sort: RatingSort,
): RankedTitle[] {
  const dir = sort === "desc" ? -1 : 1;
  const sorted = items
    .filter((item) => filter === "all" || item.mediaType === filter)
    .sort((a, b) => dir * (a.rating - b.rating) || a.title.localeCompare(b.title));

  let rank = 0;
  return sorted.map((item, i) => {
    if (i === 0 || item.rating !== sorted[i - 1].rating) rank = i + 1;
    return { ...item, rank };
  });
}
