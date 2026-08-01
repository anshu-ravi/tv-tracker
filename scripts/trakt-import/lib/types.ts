// Shared types for the Trakt -> Supabase import tool. Deliberately
// standalone (not imported from src/lib) so this tool has no dependency on
// Next.js/"server-only" and can run under plain tsx.

export type MediaType = "tv" | "anime" | "movie";
export type WatchStatus = "watchlist" | "watching" | "completed" | "dnf";
export type DataSource = "tmdb" | "anilist";

// ---- raw Trakt export shapes (only the fields we read) --------------------

export interface TraktIds {
  tmdb?: number | null;
  imdb?: string | null;
  tvdb?: number | null;
  trakt?: number | null;
  slug?: string | null;
}

export interface TraktEpisodeHistoryRecord {
  id: number;
  watched_at: string; // ISO8601
  action: string;
  type: "episode" | "movie";
  episode?: {
    ids: TraktIds;
    title: string | null;
    number: number;
    season: number;
  };
  movie?: {
    ids: TraktIds;
    title: string;
    year: number | null;
  };
  show?: {
    ids: TraktIds;
    year: number | null;
    title: string;
    aired_episodes: number;
  };
}

export interface TraktWatchlistEntry {
  type: "show" | "movie";
  show?: {
    ids: TraktIds;
    year: number | null;
    title: string;
    aired_episodes: number;
  };
  movie?: {
    ids: TraktIds;
    year: number | null;
    title: string;
  };
  listed_at: string;
}

// ---- internal aggregation shapes -------------------------------------------

export interface WatchedEpisodeRecord {
  season: number;
  episode: number;
  tmdbEpisodeId: number | null;
  watchedAt: string; // earliest watched_at for this episode
}

// One row per distinct Trakt show (keyed by tmdb show id) seen either in
// watch history or the watchlist.
export interface AggregatedShow {
  tmdbId: number;
  traktSlug: string | null;
  title: string;
  year: number | null;
  airedEpisodes: number; // Trakt's aired_episodes count at export time
  watched: Map<string, WatchedEpisodeRecord>; // key: `${season}-${episode}`
  inWatchlist: boolean;
  watchlistedAt: string | null;
}

export interface AggregatedMovie {
  tmdbId: number | null;
  imdbId: string | null;
  title: string;
  year: number | null;
  watchedAt: string | null;
  inWatchlist: boolean;
}

// ---- classification ---------------------------------------------------------

export type Classification = "tv" | "anime";

export interface ClassifiedShow extends AggregatedShow {
  classification: Classification;
  classificationReason: string;
}

// ---- enrichment (provider responses, normalized) ---------------------------

export interface EnrichedEpisode {
  seasonNumber: number;
  episodeNumber: number;
  absoluteNumber?: number | null;
  name: string | null;
  airDate: string | null;
  runtime: number | null;
}

export interface EnrichedTitle {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  posterUrl: string | null;
  isRunning: boolean;
  totalEpisodes: number | null;
  status: string | null; // raw provider status string, for reference
}

// ---- plan output -------------------------------------------------------------

export type TitleAction = "reuse_existing" | "new" | "needs_review";

export interface AnimeResolution {
  anilistId: number | null;
  anilistTitle: string | null;
  matchConfidence: "hardcoded" | "exact" | "fuzzy" | "none";
  candidates?: { id: number; title: string; year: number | null }[];
}

export interface PlanTitle {
  tmdbShowId: number; // Trakt/TMDB show id, always present for traceability
  traktTitle: string;
  traktYear: number | null;
  source: DataSource;
  sourceId: string; // tmdb id (as string) or anilist id (as string)
  mediaType: MediaType;
  action: TitleAction;
  reason: string;
  animeResolution?: AnimeResolution;
  enrichment?: EnrichedTitle | null;
  derivedStatus: WatchStatus;
  watchedEpisodeCount: number;
  totalEpisodes: number | null;
  episodes: EnrichedEpisode[]; // episodes to create for watched (+ known) eps
  watchedEpisodes: {
    season: number;
    episode: number;
    watchedAt: string;
  }[];
  needsReviewDetail?: string;
}

export interface PlanMovie {
  tmdbId: number | null;
  imdbId: string | null;
  title: string;
  year: number | null;
  skippedReason: string;
  wasWatched: boolean;
  wasWatchlisted: boolean;
}

export interface ImportPlan {
  generatedAt: string;
  sourceExportDir: string;
  totals: {
    tvTitles: number;
    animeTitles: number;
    reusedExisting: number;
    newTitles: number;
    needsReview: number;
    episodesToCreate: number;
    watchedEpisodes: number;
    watchlistOnly: number;
    moviesSkipped: number;
    statusCompleted: number;
    statusWatching: number;
    statusWatchlist: number;
  };
  titles: PlanTitle[];
  movies: PlanMovie[];
  errors: { context: string; message: string }[];
}
