import { rankingScore } from "@/lib/tmdb";
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
export const RECENCY_FLOOR = 0.15;

export const FAVORITE_BOOST = 1.5;

function completionFactor(watchedEpisodes: number, totalEpisodes: number | null): number {
  const ratio =
    totalEpisodes == null || totalEpisodes <= 0
      ? 0
      : Math.min(1, Math.max(0, watchedEpisodes / totalEpisodes));
  return COMPLETION_FLOOR + COMPLETION_SCALE * ratio;
}

function recencyFactor(lastWatchedAt: string | null, now: Date): number {
  if (!lastWatchedAt) return RECENCY_FLOOR;
  const last = new Date(lastWatchedAt).getTime();
  if (Number.isNaN(last)) return RECENCY_FLOOR;
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
    completionFactor(seed.watchedEpisodes, seed.totalEpisodes) *
    recencyFactor(seed.lastWatchedAt, now) *
    (seed.isFavorite ? FAVORITE_BOOST : 1);

  return Math.sign(base) * magnitude;
}

// Picks the top N tracked titles by absolute weight to seed TMDB
// recommendation lookups, so the caller doesn't query TMDB once per tracked
// title. Strongly-negative DNF seeds are eligible (they're informative) —
// callers combining this with candidate scoring should still pool across
// multiple seeds so no single negative seed dominates the result on its own.
export const DEFAULT_SEED_COUNT = 30;

export interface WeightedSeed {
  seed: SeedInput;
  weight: number;
}

export function selectSeeds(
  seeds: SeedInput[],
  now: Date = new Date(),
  count: number = DEFAULT_SEED_COUNT,
): WeightedSeed[] {
  return seeds
    .map((seed) => ({ seed, weight: seedWeight(seed, now) }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, count);
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
  qualityScore: number;
  score: number;
}

// Deliberately small relative to co-occurrence: this is a tie-breaker, not
// the primary signal. Over-weighting popularity here would collapse every
// rail into the same handful of famous titles, which is the failure mode
// this whole design exists to avoid.
export const QUALITY_WEIGHT = 0.1;
export const QUALITY_NORMALIZER = 40;

// Rank 0 -> 1.0, rank 19 -> ~0.32. Later positions in a seed's recommendation
// list still count, just less.
export function positionDecay(rank: number): number {
  return 1 / Math.log2(rank + 2);
}

export function scoreCandidates(candidates: CandidateInput[]): ScoredCandidate[] {
  return candidates.map((candidate) => {
    const coOccurrenceScore = candidate.recommendedBy.reduce(
      (sum, rec) => sum + rec.weight * positionDecay(rec.rank),
      0,
    );
    const qualityScore = QUALITY_WEIGHT * (rankingScore(toRankingInput(candidate)) / QUALITY_NORMALIZER);
    return {
      candidate,
      coOccurrenceScore,
      qualityScore,
      score: coOccurrenceScore + qualityScore,
    };
  });
}

function toRankingInput(candidate: CandidateInput) {
  return {
    vote_count: candidate.voteCount,
    vote_average: candidate.voteAverage,
    popularity: candidate.popularity,
  };
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
