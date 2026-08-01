// Shared domain types. NormalizedTitle / NormalizedEpisode are the provider-
// agnostic shapes that both TMDB (TV) and AniList (anime) map onto before they
// hit the Supabase catalog, so the rest of the app never depends on a provider.

export type MediaType = "tv" | "anime" | "movie";
export type WatchStatus = "watchlist" | "watching" | "completed" | "dnf";
export type DataSource = "tmdb" | "anilist";

export interface NormalizedTitle {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  originalTitle?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  overview?: string | null;
  firstAirDate?: string | null; // ISO date (YYYY-MM-DD)
  releaseStatus?: string | null; // raw provider status
  isRunning: boolean;
  totalEpisodes?: number | null;
  nextEpisodeAirDate?: string | null;
  nextEpisodeLabel?: string | null;
}

export interface NormalizedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  absoluteNumber?: number | null;
  name?: string | null;
  overview?: string | null;
  airDate?: string | null; // ISO date
  stillUrl?: string | null;
  runtime?: number | null;
}

// Creator/cast info for the title detail screen. Fetched on demand straight
// from the provider (not stored in the DB — see lib/tmdb.ts and
// lib/anilist.ts), so a missing or malformed credits response should map to
// empty arrays rather than throw.
export interface TitleCredits {
  creators: string[];
  cast: { name: string; role?: string | null; imageUrl?: string | null }[];
}

// Live-fetched ratings for the title detail screen (not stored in the DB —
// see lib/ratings.ts). imdb is a 0-10 decimal, rottenTomatoes an integer
// percent, anilistScore an integer 0-100; any of them may be null when the
// source has no rating or the lookup fails.
export interface TitleRatings {
  imdb: number | null;
  rottenTomatoes: number | null;
  anilistScore: number | null;
}

export interface SearchResult {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  overview?: string | null;
}
