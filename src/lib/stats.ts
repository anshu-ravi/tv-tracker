import type { SupabaseClient } from "@supabase/supabase-js";
import type { MediaType } from "@/lib/types";

// Server-only data layer for the "Your Stats" page. All aggregation happens
// in public.get_user_stats() (see supabase/migrations) -- RLS on
// watched_episodes / user_titles scopes it to the caller automatically, so
// this file is just a typed wrapper around one RPC call.

export interface TopShowStat {
  titleId: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  episodes: number;
  hours: number;
}

export interface YearStat {
  year: number;
  episodes: number;
  hours: number;
}

export interface RatedTitleStat {
  titleId: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  rating: number;
}

export interface RatingBucketStat {
  bucket: number;
  count: number;
}

export interface UserStats {
  // Basics
  totalEpisodes: number;
  totalHours: number;
  totalDays: number;
  distinctShows: number;
  statusCounts: {
    completed: number;
    watching: number;
    watchlist: number;
    dnf: number;
  };

  // Breakdowns
  topShowsByHours: TopShowStat[];
  byMediaType: {
    tv: { episodes: number; hours: number };
    anime: { episodes: number; hours: number };
    movie: { count: number; hours: number };
  };
  longestSeries: { title: string; episodes: number } | null;
  runtimeIsEstimatedForPct: number;

  // Time trends
  perYear: YearStat[];
  distinctWatchDays: number;
  bulkImportNote: boolean;

  // Fun
  daysOfYourLife: number;
  completionRate: number;
  busiestYear: YearStat | null;

  // Ratings
  ratingsCount: number;
  averageRating: number | null;
  ratingDistribution: RatingBucketStat[];
  averageRatingByMediaType: {
    tv: number | null;
    anime: number | null;
    movie: number | null;
  };
  highestRated: RatedTitleStat[];
  lowestRated: RatedTitleStat[];
  ratedPct: number;
}

export async function getUserStats(supabase: SupabaseClient): Promise<UserStats> {
  const { data, error } = await supabase.rpc("get_user_stats");
  if (error) throw error;
  return data as UserStats;
}
