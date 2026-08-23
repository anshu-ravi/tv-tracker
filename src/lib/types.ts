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

// A movie's watched-state is a single synthetic episode row with NULL
// season_number/episode_number (see
// supabase/migrations/20260812090000_movies_synthetic_episode.sql) — never
// season 1 / episode 1. Kept as its own shape rather than widening
// NormalizedEpisode.seasonNumber/episodeNumber to `number | null`, which
// would force every TV/anime call site (episode lists, season grouping) to
// re-guard against a case that can never happen for them.
export interface NormalizedMovieEpisode {
  name?: string | null;
  overview?: string | null;
  airDate?: string | null; // ISO date — the movie's release date
  stillUrl?: string | null;
  runtime?: number | null;
}

// Creator/cast info for the title detail screen. Fetched on demand straight
// from the provider (not stored in the DB — see lib/tmdb.ts), so a missing
// or malformed credits response should map to empty arrays rather than
// throw.
export interface TitleCredits {
  creators: string[];
  cast: { name: string; role?: string | null; imageUrl?: string | null }[];
}

// Live-fetched ratings for the title detail screen (not stored in the DB —
// see lib/ratings.ts). imdb is a 0-10 decimal, rottenTomatoes an integer
// percent; either may be null when the source has no rating or the lookup
// fails.
export interface TitleRatings {
  imdb: number | null;
  rottenTomatoes: number | null;
}

// A user-created list (or the single implicit Favorites list) for the lists
// UI. `contains` is only populated when the request scoped the lookup to a
// specific titleId (see GET /api/lists?titleId=...).
export interface ListSummary {
  id: string;
  name: string;
  isFavorites: boolean;
  titleCount: number;
  contains?: boolean; // present only when a titleId was supplied
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

// A caller's own library entry for a title, keyed by titleKey(...) at the
// call site — lets search/explore/similar results render as "already in
// your library" (linking to the detail page) instead of an add control.
export interface ExistingLibraryEntry {
  status: WatchStatus;
  titleId: string;
}

// One recommended title from a stored Explore rail (see GET
// /api/recommendations).
export interface RecommendationItem {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  posterUrl: string | null;
  overview: string | null;
  year: number | null;
  score: number;
}

// One Explore rail: either a "for_you_*" rail (seedTitle null) or a
// "because:<seedTitleId>" rail (seedTitle set to the completed title that
// produced it).
export interface RecommendationRail {
  rail: string;
  seedTitle: { titleId: string; title: string; posterUrl: string | null } | null;
  items: RecommendationItem[];
}

// Stable lookup/React-list key for a title. `sourceId` alone is NOT unique:
// TMDB assigns ids per provider namespace, so a `/tv` id and a `/movie` id
// can collide numerically despite being unrelated works. `tv` and `anime`
// share the `/tv` namespace and can even be the same underlying show
// reclassified between the two (see classifyTmdbSearchResult in lib/tmdb.ts),
// so they must map to the same key — only `movie` gets a distinct one.
export function titleKey(
  source: DataSource,
  sourceId: string,
  mediaType: MediaType,
): string {
  const namespace = mediaType === "movie" ? "movie" : "tv";
  return `${source}:${namespace}:${sourceId}`;
}
