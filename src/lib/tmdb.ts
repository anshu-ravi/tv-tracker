import "server-only";
import type {
  MediaType,
  NormalizedEpisode,
  NormalizedMovieEpisode,
  NormalizedTitle,
  SearchResult,
  TitleCredits,
} from "@/lib/types";

// TMDB client (TV shows/movies). Server-only — uses the API Read Access Token
// (v4 bearer) from TMDB_API_KEY. Never import this into a Client Component.

const BASE = "https://api.themoviedb.org/3";
const IMG = "https://image.tmdb.org/t/p";

function authHeaders(): HeadersInit {
  const token = process.env.TMDB_API_KEY;
  if (!token) throw new Error("TMDB_API_KEY is not set");
  return { Authorization: `Bearer ${token}`, accept: "application/json" };
}

async function tmdb<T>(
  path: string,
  params: Record<string, string | number> = {},
  // Refreshing a title we already have (see catalog.ts refreshCatalogTitle)
  // needs to see TMDB's current data, not whatever Next cached up to an hour
  // ago — pass `{ fresh: true }` to bypass the revalidate cache for that path.
  // `revalidate` lets a caller ask for a longer cache than the 1hr default
  // (e.g. similar-titles below, which barely moves day to day); `fresh`
  // still wins over it when both would apply.
  opts: { fresh?: boolean; revalidate?: number } = {},
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: authHeaders(),
    ...(opts.fresh
      ? { cache: "no-store" as const }
      : { next: { revalidate: opts.revalidate ?? 60 * 60 } }),
  });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

function img(path: string | null | undefined, size = "w500"): string | null {
  return path ? `${IMG}/${size}${path}` : null;
}

// ---- response shapes (only the fields we read) ------------------------------

interface TmdbSearchTvResult {
  id: number;
  name: string;
  first_air_date: string | null;
  poster_path: string | null;
  overview: string | null;
  // Used only for anime classification (see classifyTmdbSearchResult below).
  // Optional: TMDB's search endpoint normally includes these, but that's not
  // guaranteed for every result, so the classifier must not assume they're
  // present.
  genre_ids?: number[];
  origin_country?: string[];
  original_language?: string;
  // Used only for ranking (see rankingScore below). Present on
  // /recommendations and /similar results; not guaranteed elsewhere.
  vote_count?: number;
  vote_average?: number;
  popularity?: number;
}

interface TmdbTv {
  id: number;
  name: string;
  original_name: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string | null;
  status: string;
  number_of_episodes: number | null;
  seasons: { season_number: number; episode_count: number }[];
  created_by: { name: string }[];
  next_episode_to_air: {
    air_date: string | null;
    season_number: number;
    episode_number: number;
  } | null;
}

interface TmdbEpisode {
  season_number: number;
  episode_number: number;
  name: string | null;
  overview: string | null;
  air_date: string | null;
  still_path: string | null;
  runtime: number | null;
}

interface TmdbCredits {
  cast: {
    name: string;
    character: string | null;
    profile_path: string | null;
    order: number;
  }[];
}

const RUNNING_STATUSES = ["Returning Series", "In Production", "Planned"];

// TMDB's genre id for "Animation" (stable across the API, not fetched).
const ANIMATION_GENRE_ID = 16;

// ---- anime classification heuristic -----------------------------------
//
// TMDB has no dedicated "anime" media type — everything animated-or-not is
// just `tv`. As part of the AniList -> TMDB migration for anime (see
// context.md / CLAUDE.md), search results are classified as anime using the
// common working definition: Japanese-origin animation. A result counts as
// anime when it BOTH (a) carries the Animation genre (id 16) and (b) is
// Japanese-origin — `origin_country` includes "JP", or, for older/library
// titles where TMDB search leaves `origin_country` empty, falls back to
// `original_language === "ja"`.
//
// This is a heuristic, not ground truth: it will misclassify Japanese-made
// non-animation (rejected — no genre 16) as tv (correct), Japanese/foreign
// co-productions inconsistently, and non-Japanese animation as tv even if
// it's stylistically "anime-like". Kept as one small, well-commented
// function so it's easy to find and tune later if misclassifications show
// up in practice.
function classifyTmdbSearchResult(r: TmdbSearchTvResult): MediaType {
  const isAnimation = (r.genre_ids ?? []).includes(ANIMATION_GENRE_ID);
  const isJapaneseOrigin =
    (r.origin_country ?? []).includes("JP") || r.original_language === "ja";
  return isAnimation && isJapaneseOrigin ? "anime" : "tv";
}

// ---- public API -------------------------------------------------------------

// Searches TMDB's /search/tv and classifies each result as "tv" or "anime"
// (see classifyTmdbSearchResult) — TMDB is now the sole search/add source
// for anime as well as TV. AniList has been fully retired: no catalog rows
// reference it anymore, and lib/anilist.ts has been deleted.
export async function searchTv(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const data = await tmdb<{ results: TmdbSearchTvResult[] }>("/search/tv", {
    query,
    include_adult: "false",
  });
  return data.results.slice(0, 12).map((r) => ({
    source: "tmdb",
    sourceId: String(r.id),
    mediaType: classifyTmdbSearchResult(r),
    title: r.name,
    year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
    posterUrl: img(r.poster_path),
    overview: r.overview,
  }));
}

// Explore rails on the Search screen (shown before the owner types anything).
// TMDB's `/trending/tv/week` mixes tv and anime together and skews heavily
// non-anime, so it's classified and split the same way searchTv() classifies
// its results, then the anime side is topped up with a dedicated
// `/discover/tv` query (Animation genre + Japanese origin country) so that
// rail isn't left thin. Cached for 6 hours (well past the default 1hr
// metadata cache) since "trending this week" barely moves hour to hour.
const TRENDING_REVALIDATE_SECONDS = 60 * 60 * 6;

export async function getTrending(): Promise<{
  tv: SearchResult[];
  anime: SearchResult[];
}> {
  const toResult = (r: TmdbSearchTvResult): SearchResult => ({
    source: "tmdb",
    sourceId: String(r.id),
    mediaType: classifyTmdbSearchResult(r),
    title: r.name,
    year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
    posterUrl: img(r.poster_path),
    overview: r.overview,
  });

  const tv: SearchResult[] = [];
  const animeFromTrending: SearchResult[] = [];
  try {
    const url = new URL(BASE + "/trending/tv/week");
    const res = await fetch(url, {
      headers: authHeaders(),
      next: { revalidate: TRENDING_REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      throw new Error(`TMDB /trending/tv/week failed: ${res.status}`);
    }
    const trending = (await res.json()) as { results: TmdbSearchTvResult[] };
    for (const r of trending.results) {
      const result = toResult(r);
      if (result.mediaType === "anime") animeFromTrending.push(result);
      else tv.push(result);
    }
  } catch (err) {
    // Decorative rail — a failure here shouldn't blank out the anime
    // top-up below, which is fetched independently.
    console.error("TMDB trending fetch failed:", err);
  }

  let animeFromDiscover: SearchResult[] = [];
  try {
    const discoverUrl = new URL(BASE + "/discover/tv");
    discoverUrl.searchParams.set("with_genres", String(ANIMATION_GENRE_ID));
    discoverUrl.searchParams.set("with_origin_country", "JP");
    discoverUrl.searchParams.set("sort_by", "popularity.desc");
    const discoverRes = await fetch(discoverUrl, {
      headers: authHeaders(),
      next: { revalidate: TRENDING_REVALIDATE_SECONDS },
    });
    if (!discoverRes.ok) {
      throw new Error(`TMDB /discover/tv failed: ${discoverRes.status}`);
    }
    const discover = (await discoverRes.json()) as {
      results: TmdbSearchTvResult[];
    };
    animeFromDiscover = discover.results.map(toResult);
  } catch (err) {
    // Decorative rail — a failure here shouldn't blank out the trending
    // TV rail fetched above.
    console.error("TMDB discover fetch failed:", err);
  }

  const seen = new Set(animeFromTrending.map((r) => r.sourceId));
  const anime = animeFromTrending.slice();
  for (const r of animeFromDiscover) {
    if (seen.has(r.sourceId)) continue;
    seen.add(r.sourceId);
    anime.push(r);
  }

  return { tv: tv.slice(0, 12), anime: anime.slice(0, 12) };
}

export async function getTvTitle(
  id: string,
  // `mediaType` lets a caller fetch the exact same TMDB show as either "tv"
  // or "anime" — anime is now TMDB-sourced too (see classifyTmdbSearchResult
  // above), but still keeps its own media_type so it stays in the Anime
  // library tab and filler tags keep working. Defaults to "tv" for the
  // existing TV call sites.
  opts: { fresh?: boolean; mediaType?: MediaType } = {},
): Promise<{ title: NormalizedTitle; episodes: NormalizedEpisode[] }> {
  const mediaType = opts.mediaType ?? "tv";
  const tv = await tmdb<TmdbTv>(`/tv/${id}`, {}, opts);
  const next = tv.next_episode_to_air;

  const title: NormalizedTitle = {
    source: "tmdb",
    sourceId: String(tv.id),
    mediaType,
    title: tv.name,
    originalTitle: tv.original_name,
    posterUrl: img(tv.poster_path),
    backdropUrl: img(tv.backdrop_path, "w780"),
    overview: tv.overview,
    firstAirDate: tv.first_air_date || null,
    releaseStatus: tv.status,
    isRunning: RUNNING_STATUSES.includes(tv.status),
    totalEpisodes: tv.number_of_episodes ?? null,
    nextEpisodeAirDate: next?.air_date ?? null,
    nextEpisodeLabel: next
      ? `S${next.season_number} E${next.episode_number}`
      : null,
  };

  // Fetch episodes per real season (skip specials in season 0).
  const seasons = tv.seasons.filter(
    (s) => s.season_number > 0 && s.episode_count > 0,
  );
  const episodes: NormalizedEpisode[] = [];
  // Anime keeps an absolute_number (1..N across all real seasons, broadcast
  // order) so filler-tag lookups (lib/animefillerlist.ts) and any
  // still-un-migrated absolute-numbered rows stay comparable. TV titles
  // never had absolute numbering and don't get one here either — the
  // counter only advances/is used when mediaType is "anime".
  let absoluteCounter = 0;
  for (const s of seasons) {
    const sd = await tmdb<{ episodes: TmdbEpisode[] }>(
      `/tv/${id}/season/${s.season_number}`,
      {},
      opts,
    );
    for (const e of sd.episodes) {
      absoluteCounter += 1;
      episodes.push({
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        absoluteNumber: mediaType === "anime" ? absoluteCounter : null,
        name: e.name,
        overview: e.overview,
        airDate: e.air_date || null,
        stillUrl: img(e.still_path, "w300"),
        runtime: e.runtime,
      });
    }
  }

  return { title, episodes };
}

// Creators + top cast for the detail screen. Fetched separately (not baked
// into getTvTitle) since it's only needed when a user opens a title's detail
// page, not on every add/search. `append_to_response=credits` gets both
// created_by and the cast list in one request.
export async function getTvCredits(id: string): Promise<TitleCredits> {
  const tv = await tmdb<TmdbTv & { credits?: TmdbCredits }>(`/tv/${id}`, {
    append_to_response: "credits",
  });

  const creators = (tv.created_by ?? []).map((c) => c.name);
  const cast = (tv.credits?.cast ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 10)
    .map((c) => ({
      name: c.name,
      role: c.character,
      imageUrl: img(c.profile_path, "w185"),
    }));

  return { creators, cast };
}

// IMDb id for a TV show, used to look up OMDb ratings (see lib/ratings.ts).
// TMDB's external_ids endpoint returns null when a show has no IMDb entry.
export async function getTvImdbId(id: string): Promise<string | null> {
  const data = await tmdb<{ imdb_id: string | null }>(`/tv/${id}/external_ids`);
  return data.imdb_id || null;
}

// ---- movies -------------------------------------------------------------------
//
// TMDB's /movie endpoints use different field names than /tv (see below) and
// have no concept of seasons/episodes, so these are deliberately separate
// functions rather than a mediaType branch bolted onto the /tv helpers above.
//
// Field-name differences from the /tv shapes used above:
//   name              -> title            (and original_name -> original_title)
//   first_air_date    -> release_date
//   number_of_episodes / seasons / next_episode_to_air -> none; a movie has a
//     single top-level `runtime` (minutes) instead of a per-episode runtime
//   created_by (array of {name}) -> no equivalent field; directors come from
//     credits.crew filtered to job === "Director"
//   status vocabulary differs: TV uses "Returning Series"/"Ended"/etc, movies
//     use "Rumored"/"Planned"/"In Production"/"Post Production"/"Released"/
//     "Canceled" — none of which mean "currently airing", so isRunning is
//     always false for a movie (see the product decision in lib/api/catalog.ts:
//     movies never appear on Home / Upcoming and have no "watching" bucket)
//   /movie/{id}/external_ids has the same { imdb_id } shape as /tv's, just at
//     a different path

interface TmdbSearchMovieResult {
  id: number;
  title: string;
  release_date: string | null;
  poster_path: string | null;
  overview: string | null;
  // Used only for ranking (see rankingScore below). Present on
  // /recommendations and /similar results; not guaranteed elsewhere.
  vote_count?: number;
  vote_average?: number;
  popularity?: number;
}

interface TmdbMovie {
  id: number;
  title: string;
  original_title: string;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  runtime: number | null;
  status: string;
}

interface TmdbMovieCredits {
  crew: { name: string; job: string }[];
  cast: {
    name: string;
    character: string | null;
    profile_path: string | null;
    order: number;
  }[];
}

export async function searchMovie(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const data = await tmdb<{ results: TmdbSearchMovieResult[] }>(
    "/search/movie",
    { query, include_adult: "false" },
  );
  return data.results.slice(0, 12).map((r) => ({
    source: "tmdb",
    sourceId: String(r.id),
    mediaType: "movie",
    title: r.title,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    posterUrl: img(r.poster_path),
    overview: r.overview,
  }));
}

// Movies map onto a NormalizedTitle plus a single NormalizedMovieEpisode
// (not an array) — see the type's doc comment in lib/types.ts for why this
// isn't NormalizedEpisode with nulled-out season/episode numbers. The
// release date is mapped onto both titles.first_air_date (so the catalog's
// existing "year" display keeps working across media types) and the
// synthetic episode's air_date; runtime maps onto the synthetic episode's
// runtime column.
export async function getMovieTitle(
  id: string,
  opts: { fresh?: boolean } = {},
): Promise<{ title: NormalizedTitle; episode: NormalizedMovieEpisode }> {
  const movie = await tmdb<TmdbMovie>(`/movie/${id}`, {}, opts);

  const title: NormalizedTitle = {
    source: "tmdb",
    sourceId: String(movie.id),
    mediaType: "movie",
    title: movie.title,
    originalTitle: movie.original_title,
    posterUrl: img(movie.poster_path),
    backdropUrl: img(movie.backdrop_path, "w780"),
    overview: movie.overview,
    firstAirDate: movie.release_date || null,
    releaseStatus: movie.status,
    isRunning: false,
    totalEpisodes: null,
    nextEpisodeAirDate: null,
    nextEpisodeLabel: null,
  };

  const episode: NormalizedMovieEpisode = {
    name: movie.title,
    overview: movie.overview,
    airDate: movie.release_date || null,
    stillUrl: img(movie.poster_path),
    runtime: movie.runtime,
  };

  return { title, episode };
}

// Director(s) + top cast for the detail screen. Movies have no created_by
// field — directors come from credits.crew (job === "Director") instead.
export async function getMovieCredits(id: string): Promise<TitleCredits> {
  const movie = await tmdb<TmdbMovie & { credits?: TmdbMovieCredits }>(
    `/movie/${id}`,
    { append_to_response: "credits" },
  );

  const creators = (movie.credits?.crew ?? [])
    .filter((c) => c.job === "Director")
    .map((c) => c.name);
  const cast = (movie.credits?.cast ?? [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .slice(0, 10)
    .map((c) => ({
      name: c.name,
      role: c.character,
      imageUrl: img(c.profile_path, "w185"),
    }));

  return { creators, cast };
}

// IMDb id for a movie, used to look up OMDb ratings (see lib/ratings.ts).
// Same response shape as getTvImdbId, different path.
export async function getMovieImdbId(id: string): Promise<string | null> {
  const data = await tmdb<{ imdb_id: string | null }>(
    `/movie/${id}/external_ids`,
  );
  return data.imdb_id || null;
}

// ---- similar titles -----------------------------------------------------------
//
// "Similar" rail on both title screens (see components/SimilarRail.tsx).
// TMDB's /recommendations (derived from aggregate user behaviour) is a much
// better signal than /similar (pure genre/keyword matching), so
// recommendations are always the primary source; /similar is only queried
// as a last resort when recommendations come back thin after ranking, and
// never overrides a recommendation on an id collision. Cached for 24h —
// this barely moves day to day.
//
// TMDB's /recommendations page order is not quality-ranked (page 1 for a
// well-known show can be dominated by 2-vote noise), so 3 pages are pulled
// and re-ranked by rankingScore instead of trusting page 1 alone.

const SIMILAR_MIN_RESULTS = 6;
// Candidate pool returned from here — deliberately larger than what's shown.
// api/titles/similar/route.ts partitions this into untracked (cap 12) and
// tracked (cap 6) groups; that route-level cap is what's authoritative for
// what actually renders, not this one.
const SIMILAR_LIBRARY_CAP = 20;
const SIMILAR_REVALIDATE_SECONDS = 60 * 60 * 24;
const RECOMMENDATION_PAGES = 3;
// Minimum vote_count to trust a candidate. Relaxed in order when it would
// leave too few results — an obscure seed shouldn't end up with an empty
// rail just because nothing clears 150 votes.
const VOTE_FLOORS = [150, 50, 0];

// Ranking score for candidate titles — also meant for reuse by a future
// personalized-recommendations pipeline, not just this rail. Log-scales vote
// count and popularity so a handful of blockbusters can't drown out
// otherwise well-reviewed results.
export function rankingScore(candidate: {
  vote_count?: number;
  vote_average?: number;
  popularity?: number;
}): number {
  const voteCount = candidate.vote_count ?? 0;
  const voteAverage = candidate.vote_average ?? 0;
  const popularity = candidate.popularity ?? 0;
  return Math.log10(voteCount + 1) * voteAverage + Math.log10(popularity + 1) * 3;
}

// Fetches recommendation pages 1..RECOMMENDATION_PAGES in parallel and
// merges them. A page that fails or doesn't exist is dropped rather than
// failing the whole call — a title with only one page of recommendations
// still returns usable results.
async function fetchRecommendationPages<T>(path: string): Promise<T[]> {
  const settled = await Promise.allSettled(
    Array.from({ length: RECOMMENDATION_PAGES }, (_, i) =>
      tmdb<{ results: T[] }>(path, { page: i + 1 }, { revalidate: SIMILAR_REVALIDATE_SECONDS }),
    ),
  );
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value.results : []));
}

function applyVoteFloor<T extends { vote_count?: number }>(candidates: T[]): T[] {
  let result = candidates;
  for (const floor of VOTE_FLOORS) {
    result = candidates.filter((c) => (c.vote_count ?? 0) >= floor);
    if (result.length >= SIMILAR_MIN_RESULTS) break;
  }
  return result;
}

// Shared candidate-gathering pipeline for getSimilarTv/getSimilarMovie:
// recommendations (3 pages, poster + vote-floor filtered) ranked by score,
// topped up from /similar only when that pool is thin. `filterSimilar` lets
// the anime seed case drop off-genre /similar drift (see getSimilarTv).
async function gatherSimilarCandidates<
  T extends {
    id: number;
    poster_path: string | null;
    vote_count?: number;
    vote_average?: number;
    popularity?: number;
  },
>(
  recommendationsPath: string,
  similarPath: string,
  filterSimilar?: (candidate: T) => boolean,
): Promise<T[]> {
  const recs = await fetchRecommendationPages<T>(recommendationsPath);
  const floored = applyVoteFloor(recs.filter((r) => r.poster_path));

  const seen = new Set(floored.map((r) => r.id));
  const combined = floored.slice();

  if (combined.length < SIMILAR_MIN_RESULTS) {
    const similar = await tmdb<{ results: T[] }>(
      similarPath,
      {},
      { revalidate: SIMILAR_REVALIDATE_SECONDS },
    );
    let topUp = applyVoteFloor(similar.results.filter((r) => r.poster_path));
    if (filterSimilar) topUp = topUp.filter(filterSimilar);
    for (const r of topUp) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      combined.push(r);
    }
  }

  combined.sort((a, b) => rankingScore(b) - rankingScore(a));
  return combined.slice(0, SIMILAR_LIBRARY_CAP);
}

function toSimilarTvResult(r: TmdbSearchTvResult): SearchResult {
  return {
    source: "tmdb",
    sourceId: String(r.id),
    mediaType: classifyTmdbSearchResult(r),
    title: r.name,
    year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
    posterUrl: img(r.poster_path),
    overview: r.overview,
  };
}

// `seedIsAnime` (the seed title's own classification, from the route's
// mediaType) drops non-anime /similar results — TMDB's /similar drifts
// off-genre for anime (e.g. Doctor Who under Bleach) more than
// /recommendations does, so this only matters for the last-resort top-up.
export async function getSimilarTv(id: string, seedIsAnime = false): Promise<SearchResult[]> {
  const candidates = await gatherSimilarCandidates<TmdbSearchTvResult>(
    `/tv/${id}/recommendations`,
    `/tv/${id}/similar`,
    seedIsAnime ? (r) => classifyTmdbSearchResult(r) === "anime" : undefined,
  );
  return candidates.map(toSimilarTvResult);
}

function toSimilarMovieResult(r: TmdbSearchMovieResult): SearchResult {
  return {
    source: "tmdb",
    sourceId: String(r.id),
    mediaType: "movie",
    title: r.title,
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    posterUrl: img(r.poster_path),
    overview: r.overview,
  };
}

export async function getSimilarMovie(id: string): Promise<SearchResult[]> {
  const candidates = await gatherSimilarCandidates<TmdbSearchMovieResult>(
    `/movie/${id}/recommendations`,
    `/movie/${id}/similar`,
  );
  return candidates.map(toSimilarMovieResult);
}

// ---- personalized recommendations (lib/api/recommendations.ts) ---------------
//
// Raw, unranked recommendation candidates for one seed title. Unlike
// gatherSimilarCandidates above (which ranks and caps for a single rail),
// this hands candidates back untouched — the personalized pipeline pools
// results across many seeds before lib/recommendations.ts scoreCandidates
// does the ranking, so ranking here would be thrown away. Only 2 pages (vs
// 3 for similar-titles): a thin single-seed pool matters less here since
// candidates pool across many seeds per media type (see selectSeeds).
const RECOMMENDATION_CANDIDATE_PAGES = 2;
const RECOMMENDATION_CANDIDATE_REVALIDATE_SECONDS = 60 * 60 * 24;

export interface RecommendationCandidate {
  source: "tmdb";
  sourceId: string;
  mediaType: MediaType;
  title: string;
  posterUrl: string | null;
  year: number | null;
  overview: string | null;
  voteCount: number;
  voteAverage: number;
  popularity: number;
  rank: number; // zero-based position in this seed's merged result list
}

function toRecommendationTvCandidate(
  r: TmdbSearchTvResult,
  rank: number,
): RecommendationCandidate {
  return {
    source: "tmdb",
    sourceId: String(r.id),
    mediaType: classifyTmdbSearchResult(r),
    title: r.name,
    posterUrl: img(r.poster_path),
    year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
    overview: r.overview,
    voteCount: r.vote_count ?? 0,
    voteAverage: r.vote_average ?? 0,
    popularity: r.popularity ?? 0,
    rank,
  };
}

function toRecommendationMovieCandidate(
  r: TmdbSearchMovieResult,
  rank: number,
): RecommendationCandidate {
  return {
    source: "tmdb",
    sourceId: String(r.id),
    mediaType: "movie",
    title: r.title,
    posterUrl: img(r.poster_path),
    year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
    overview: r.overview,
    voteCount: r.vote_count ?? 0,
    voteAverage: r.vote_average ?? 0,
    popularity: r.popularity ?? 0,
    rank,
  };
}

export async function getRecommendationCandidates(
  sourceId: string,
  mediaType: MediaType,
): Promise<RecommendationCandidate[]> {
  const path =
    mediaType === "movie"
      ? `/movie/${sourceId}/recommendations`
      : `/tv/${sourceId}/recommendations`;

  // Pages fetched in parallel and merged in request order (not resolution
  // order — Promise.allSettled preserves input order), so rank stays a
  // stable zero-based position across the page boundary. A failed page is
  // dropped rather than failing the whole call.
  const settled = await Promise.allSettled(
    Array.from({ length: RECOMMENDATION_CANDIDATE_PAGES }, (_, i) =>
      tmdb<{ results: (TmdbSearchTvResult | TmdbSearchMovieResult)[] }>(
        path,
        { page: i + 1 },
        { revalidate: RECOMMENDATION_CANDIDATE_REVALIDATE_SECONDS },
      ),
    ),
  );
  const merged = settled.flatMap((r) => (r.status === "fulfilled" ? r.value.results : []));

  // Rank is assigned over the full merged list before posterless results are
  // dropped, so it reflects TMDB's own ordering rather than a
  // filtered-list-relative position.
  return merged
    .map((r, rank) => ({ r, rank }))
    .filter(({ r }) => r.poster_path)
    .map(({ r, rank }) =>
      mediaType === "movie"
        ? toRecommendationMovieCandidate(r as TmdbSearchMovieResult, rank)
        : toRecommendationTvCandidate(r as TmdbSearchTvResult, rank),
    );
}

// ---- anime enrichment (lib/tmdbAnimeMatch.ts) --------------------------------
// TMDB has no concept of "anime" — these hit the same /search/tv and /tv/{id}
// endpoints above, but return raw/lightweight shapes tmdbAnimeMatch.ts needs
// for fuzzy-matching an AniList title before committing to a full episode
// fetch. Kept in this file (rather than a new client) per the existing
// convention: one TMDB HTTP client, extended as new endpoints are needed.

export interface TmdbMatchCandidate {
  id: number;
  name: string;
  firstAirDate: string | null;
}

// Raw /search/tv results for anime title matching — unlike searchTv() above,
// this keeps the numeric id and full first_air_date (not just a year), which
// the matcher needs to score candidates.
export async function searchTvForAnimeMatch(query: string): Promise<TmdbMatchCandidate[]> {
  if (!query.trim()) return [];
  const data = await tmdb<{ results: TmdbSearchTvResult[] }>("/search/tv", {
    query,
    include_adult: "false",
  });
  return data.results.slice(0, 5).map((r) => ({
    id: r.id,
    name: r.name,
    firstAirDate: r.first_air_date || null,
  }));
}

export interface TmdbSeasonSummary {
  seasonNumber: number;
  episodeCount: number;
}

export interface TmdbShowSummary {
  id: number;
  name: string;
  totalEpisodes: number | null;
  seasons: TmdbSeasonSummary[];
}

// Lightweight /tv/{id} fetch (no per-season episode fetch) — enough to test
// the "whole" and "season" episode-count strategies before paying for a full
// episode fetch. Specials (season_number 0) are excluded, matching the "not
// sufficient evidence alone" episode-count checks in tmdbAnimeMatch.ts.
export async function getTvShowSummary(id: string): Promise<TmdbShowSummary> {
  const tv = await tmdb<TmdbTv>(`/tv/${id}`);
  const seasons = tv.seasons
    .filter((s) => s.season_number > 0)
    .map((s) => ({ seasonNumber: s.season_number, episodeCount: s.episode_count }));
  return {
    id: tv.id,
    name: tv.name,
    totalEpisodes: seasons.reduce((sum, s) => sum + s.episodeCount, 0) || null,
    seasons,
  };
}

export interface TmdbEpisodeDetail {
  seasonNumber: number;
  episodeNumber: number;
  name: string | null;
  overview: string | null;
  airDate: string | null;
  stillUrl: string | null;
  runtime: number | null;
}

// One TMDB season's episodes, in air order — used by the "whole" strategy
// (called once per real season) and the "season" strategy (called once).
export async function getTvSeasonEpisodesDetail(
  id: string,
  seasonNumber: number,
): Promise<TmdbEpisodeDetail[]> {
  const sd = await tmdb<{ episodes: TmdbEpisode[] }>(`/tv/${id}/season/${seasonNumber}`);
  return sd.episodes.map((e) => ({
    seasonNumber: e.season_number,
    episodeNumber: e.episode_number,
    name: e.name,
    overview: e.overview,
    airDate: e.air_date || null,
    stillUrl: img(e.still_path, "w300"),
    runtime: e.runtime,
  }));
}

export interface TmdbEpisodeGroupSummary {
  id: string;
  name: string;
  type: number; // TMDB group types: 2 = "Absolute" order, others (production, story arc, ...) are not usable here
  episodeCount: number;
  groupCount: number;
}

interface TmdbEpisodeGroupsResponse {
  results: {
    id: string;
    name: string;
    type: number;
    episode_count: number;
    group_count: number;
  }[];
}

// /tv/{id}/episode_groups lists any custom orderings TMDB (via TheTVDB
// contributors) has curated for this show — the "group" match strategy only
// cares about type 2 ("Absolute"), which is filtered by the caller.
export async function getTvEpisodeGroups(id: string): Promise<TmdbEpisodeGroupSummary[]> {
  const data = await tmdb<TmdbEpisodeGroupsResponse>(`/tv/${id}/episode_groups`);
  return data.results.map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    episodeCount: g.episode_count,
    groupCount: g.group_count,
  }));
}

interface TmdbEpisodeGroupDetailResponse {
  groups: {
    order: number;
    episodes: TmdbEpisode[];
  }[];
}

// /tv/episode_group/{id} — the group's episodes, already carrying
// overview/still/runtime, flattened across its sub-groups (ordered by group
// order, then TMDB's episode order within each) into absolute 1..N. This is
// TMDB's own curated absolute ordering, so no extra season fetches needed.
export async function getEpisodeGroupEpisodes(groupId: string): Promise<TmdbEpisodeDetail[]> {
  const data = await tmdb<TmdbEpisodeGroupDetailResponse>(`/tv/episode_group/${groupId}`);
  const out: TmdbEpisodeDetail[] = [];
  for (const g of data.groups.slice().sort((a, b) => a.order - b.order)) {
    for (const e of g.episodes) {
      out.push({
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        name: e.name,
        overview: e.overview,
        airDate: e.air_date || null,
        stillUrl: img(e.still_path, "w300"),
        runtime: e.runtime,
      });
    }
  }
  return out;
}
