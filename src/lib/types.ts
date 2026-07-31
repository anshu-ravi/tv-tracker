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

export interface SearchResult {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  overview?: string | null;
}
