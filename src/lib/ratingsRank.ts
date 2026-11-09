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

// Ranks run 1, 2, 3… in order; equal ratings are ordered alphabetically.
export function rankRatings(
  items: RatedTitle[],
  filter: RatingFilter,
  sort: RatingSort,
): RankedTitle[] {
  const dir = sort === "desc" ? -1 : 1;
  return items
    .filter((item) => filter === "all" || item.mediaType === filter)
    .sort((a, b) => dir * (a.rating - b.rating) || a.title.localeCompare(b.title))
    .map((item, i) => ({ ...item, rank: i + 1 }));
}
