import { titleKey, type DataSource, type MediaType, type WatchStatus } from "@/lib/types";

// Pure scoring for the personalized recommendations pipeline: weighting the
// owner's tracked titles as seeds, then scoring TMDB-recommended candidates
// pooled across those seeds. No I/O — callers fetch from Supabase/TMDB and
// pass data in.

// ---- seed weighting -----------------------------------------------------------

export interface SeedInput {
  titleId: string;
  sourceId: string;
  mediaType: MediaType;
  status: WatchStatus;
  rating: number | null; // explicit 0.5-5.0, null when unrated
  isFavorite: boolean;
  watchedEpisodes: number;
  totalEpisodes: number | null;
  lastWatchedAt: string | null; // ISO date, null when never/unknown
}

export const STATUS_BASE_WEIGHT: Record<WatchStatus, number> = {
  completed: 1.0,
  watching: 0.9,
  watchlist: 0.3,
  dnf: -0.6,
};

// Rating -> base weight: (rating - 3) / 2, so 5.0 -> 1.0, 3.0 -> 0 (neutral),
// 1.0 -> -1.0. Overrides the status base entirely when present.
export const RATING_NEUTRAL = 3.0;
export const RATING_DIVISOR = 2.0;

// Completion factor floor/scale: a barely-started show still carries some
// signal (0.25), scaling up to 1.0 at full completion.
export const COMPLETION_FLOOR = 0.25;
export const COMPLETION_SCALE = 0.75;

// Recency decay: exponential half-life on days since lastWatchedAt, floored
// so a long-finished favorite never decays to nothing.
export const RECENCY_HALF_LIFE_DAYS = 548; // ~18 months
export const RECENCY_FLOOR = 0.4;

// A null date means a retrospective complete from the historical backlog, not an ancient watch, so it must not take the floor penalty.
export const RECENCY_UNKNOWN = 0.8;

export const FAVORITE_BOOST = 1.5;

function completionFactor(
  watchedEpisodes: number,
  totalEpisodes: number | null,
  mediaType: MediaType,
): number {
  // A movie is a single unit of content, so its effective total is always 1
  // -- totalEpisodes is null for every movie (synthetic-episode design, see
  // NormalizedMovieEpisode) and would otherwise floor every movie's weight.
  const effectiveTotal = mediaType === "movie" ? 1 : totalEpisodes;
  const ratio =
    effectiveTotal == null || effectiveTotal <= 0
      ? 0
      : Math.min(1, Math.max(0, watchedEpisodes / effectiveTotal));
  return COMPLETION_FLOOR + COMPLETION_SCALE * ratio;
}

function recencyFactor(lastWatchedAt: string | null, now: Date): number {
  if (!lastWatchedAt) return RECENCY_UNKNOWN;
  const last = new Date(lastWatchedAt).getTime();
  if (Number.isNaN(last)) return RECENCY_UNKNOWN;
  const ageDays = Math.max(0, (now.getTime() - last) / (1000 * 60 * 60 * 24));
  const decayed = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
  return Math.max(RECENCY_FLOOR, decayed);
}

// Weight of one tracked title as a recommendation seed. An explicit rating
// overrides the status base entirely (ratings are the point of collecting
// them — they must outrank the heuristics, not average with them); the
// completion/recency/favorite factors then scale the magnitude while
// preserving sign, so a strongly-negative DNF seed stays negative.
export function seedWeight(seed: SeedInput, now: Date = new Date()): number {
  const base =
    seed.rating != null
      ? (seed.rating - RATING_NEUTRAL) / RATING_DIVISOR
      : STATUS_BASE_WEIGHT[seed.status];

  const magnitude =
    Math.abs(base) *
    completionFactor(seed.watchedEpisodes, seed.totalEpisodes, seed.mediaType) *
    recencyFactor(seed.lastWatchedAt, now) *
    (seed.isFavorite ? FAVORITE_BOOST : 1);

  return Math.sign(base) * magnitude;
}

// Picks the top N tracked titles per media type by absolute weight to seed
// TMDB recommendation lookups, so the caller doesn't query TMDB once per
// tracked title. Per-media-type (not one global top-N) because TV seeds
// otherwise dominate by sheer weight and no movie or anime ever gets picked
// -- a media type with fewer tracked titles than its quota just contributes
// fewer seeds, never backfilled from another type. Strongly-negative DNF
// seeds are eligible (they're informative) -- callers combining this with
// candidate scoring should still pool across multiple seeds so no single
// negative seed dominates the result on its own.
export const SEED_COUNT_TV = 14;
export const SEED_COUNT_ANIME = 10;
export const SEED_COUNT_MOVIE = 8;

export const DEFAULT_SEED_COUNTS: Record<MediaType, number> = {
  tv: SEED_COUNT_TV,
  anime: SEED_COUNT_ANIME,
  movie: SEED_COUNT_MOVIE,
};

export interface WeightedSeed {
  seed: SeedInput;
  weight: number;
}

export function selectSeeds(
  seeds: SeedInput[],
  now: Date = new Date(),
  counts: Record<MediaType, number> = DEFAULT_SEED_COUNTS,
): WeightedSeed[] {
  const weighted = seeds.map((seed) => ({ seed, weight: seedWeight(seed, now) }));

  const byMediaType = new Map<MediaType, WeightedSeed[]>();
  for (const ws of weighted) {
    const bucket = byMediaType.get(ws.seed.mediaType);
    if (bucket) bucket.push(ws);
    else byMediaType.set(ws.seed.mediaType, [ws]);
  }

  const result: WeightedSeed[] = [];
  for (const [mediaType, bucket] of byMediaType) {
    const count = counts[mediaType] ?? 0;
    result.push(
      ...bucket.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, count),
    );
  }
  return result;
}

// ---- candidate scoring ---------------------------------------------------------

export interface RecommendationSource {
  seedId: string; // titleId of the seed that recommended this candidate
  weight: number; // that seed's seedWeight
  rank: number; // zero-based position in that seed's TMDB result list
}

export interface CandidateInput {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  title: string;
  posterUrl: string | null;
  year: number | null;
  overview: string | null;
  voteCount: number;
  voteAverage: number;
  popularity: number;
  recommendedBy: RecommendationSource[];
}

export interface ScoredCandidate {
  candidate: CandidateInput;
  coOccurrenceScore: number;
  score: number;
}

// Rank 0 -> 1.0, rank 19 -> ~0.32. Later positions in a seed's recommendation
// list still count, just less.
export function positionDecay(rank: number): number {
  return 1 / Math.log2(rank + 2);
}

// Lift correction: a title that appears in nearly every seed's recommendation
// list ("hub" titles -- widely popular, not specifically matching any seed)
// collects a large co-occurrence sum without earning it. Dividing that sum by
// a function of voteCount makes popularity a cost instead of a bonus, so a
// hub has to be specifically co-recommended, not just famous, to rank highly.
// Reversible in one line: set to 0 to fall back to the raw co-occurrence sum.
export const HUB_DAMPING = 1;

export function scoreCandidates(candidates: CandidateInput[]): ScoredCandidate[] {
  return candidates.map((candidate) => {
    const coOccurrenceScore = candidate.recommendedBy.reduce(
      (sum, rec) => sum + rec.weight * positionDecay(rec.rank),
      0,
    );
    const hubDamping = Math.log10(candidate.voteCount + 10) ** HUB_DAMPING;
    return {
      candidate,
      coOccurrenceScore,
      score: coOccurrenceScore / hubDamping,
    };
  });
}

// Same relaxation ladder as the similar-titles rail: an obscure candidate
// pool degrades in trust rather than coming back empty.
export const VOTE_FLOORS = [150, 50, 0];

export function applyVoteFloor<T extends { voteCount: number }>(
  candidates: T[],
  minResults: number,
): T[] {
  let result = candidates;
  for (const floor of VOTE_FLOORS) {
    result = candidates.filter((c) => c.voteCount >= floor);
    if (result.length >= minResults) break;
  }
  return result;
}

// Drops candidates already tracked or dismissed, keyed the same way as the
// rest of the app (see titleKey in @/lib/types) so this can't drift into a
// second key format.
export function excludeKnownTitles<
  T extends { source: DataSource; sourceId: string; mediaType: MediaType },
>(candidates: T[], excludedKeys: Set<string>): T[] {
  return candidates.filter(
    (c) => !excludedKeys.has(titleKey(c.source, c.sourceId, c.mediaType)),
  );
}

// ---- franchise exclusion --------------------------------------------------

// A tracked title shorter than this can't be trusted as a franchise-match
// pattern (e.g. a tracked "Dark" would otherwise nuke every candidate whose
// title happens to contain the word "dark").
export const FRANCHISE_MIN_TRACKED_TITLE_LENGTH = 5;

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function containsWholeWord(haystack: string, needle: string): boolean {
  return needle.length > 0 && ` ${haystack} `.includes(` ${needle} `);
}

// Drops candidates that are franchise continuations of an already-tracked
// title -- e.g. Boruto when Naruto is tracked -- matched by normalized
// whole-word title containment (deliberately not fuzzy similarity, so the
// rule stays explainable). Also collapses candidates that are duplicates of
// each other by normalized title (e.g. two TMDB entries for the same show),
// keeping the higher-scoring one.
export function excludeFranchiseSequels(
  candidates: ScoredCandidate[],
  trackedTitles: string[],
): ScoredCandidate[] {
  const trackedNormalized = Array.from(
    new Set(
      trackedTitles
        .map(normalizeTitle)
        .filter((t) => t.length >= FRANCHISE_MIN_TRACKED_TITLE_LENGTH),
    ),
  );

  const notFranchise = candidates.filter((c) => {
    const candidateNorm = normalizeTitle(c.candidate.title);
    return !trackedNormalized.some(
      (tracked) =>
        containsWholeWord(candidateNorm, tracked) || containsWholeWord(tracked, candidateNorm),
    );
  });

  const bestByTitle = new Map<string, ScoredCandidate>();
  for (const c of notFranchise) {
    const key = normalizeTitle(c.candidate.title);
    const existing = bestByTitle.get(key);
    if (!existing || c.score > existing.score) {
      bestByTitle.set(key, c);
    }
  }
  return Array.from(bestByTitle.values());
}
