// Personalized recommendations pipeline: loads the owner's tracked titles as
// seeds, fetches TMDB recommendation candidates for the top-weighted seeds,
// pools/scores them (see lib/recommendations.ts), and writes the resulting
// Explore rails to the `recommendations` table. No UI here — this backs
// POST /api/recommendations/refresh; GET /api/recommendations only reads
// what this wrote.
import { getRecommendationCandidates, type RecommendationCandidate } from "@/lib/tmdb";
import { getFavoriteTitleIds } from "@/lib/favorites";
import {
  applyVoteFloor,
  excludeFranchiseSequels,
  excludeKnownTitles,
  scoreCandidates,
  selectSeeds,
  type CandidateInput,
  type RecommendationSource,
  type ScoredCandidate,
  type SeedInput,
  type WeightedSeed,
} from "@/lib/recommendations";
import { titleKey, type DataSource, type MediaType, type WatchStatus } from "@/lib/types";

// The Supabase client is untyped in this codebase (see catalog.ts) — match
// that convention here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

const CANDIDATE_FETCH_CONCURRENCY = 3;
// Rail sizes -- exported as named constants since these get tuned again.
export const FOR_YOU_RAIL_SIZE = 12;
export const BECAUSE_RAIL_COUNT = 8;
export const BECAUSE_RAIL_SIZE = 8;
const MEDIA_TYPES: MediaType[] = ["tv", "anime", "movie"];
// Roughly the total slots every rail combined can hold (3 for_you rails +
// BECAUSE_RAIL_COUNT because rails) — applyVoteFloor relaxes its floor until
// at least this many candidates clear it, so a thin pool still fills the
// rails.
const VOTE_FLOOR_MIN_RESULTS = FOR_YOU_RAIL_SIZE * 3 + BECAUSE_RAIL_COUNT * BECAUSE_RAIL_SIZE;

// Small helper: run `items` through `worker` with at most `limit` in flight
// at once. Mirrors mapWithConcurrency in api/titles/refresh/route.ts and the
// refresh-air-dates Edge Function — same modest concurrency (3) so a
// 30-seed run doesn't hammer TMDB.
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function runOne(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, runOne);
  await Promise.all(workers);
}

// ---- loading seeds --------------------------------------------------------

interface WatchedAggregates {
  countByTitle: Map<string, number>;
  lastWatchedByTitle: Map<string, string>;
}

interface WatchedEpisodeRow {
  title_id: string;
  watched_at: string | null;
}

// Paginates past Supabase's per-request row cap (the owner has ~6,630
// watched episodes) and aggregates per-title count + most recent watched_at
// in TypeScript, mirroring fetchAllWatchedEpisodes in lib/stats.ts.
async function loadWatchedAggregates(supabase: SupabaseClient): Promise<WatchedAggregates> {
  const pageSize = 1000;
  const countByTitle = new Map<string, number>();
  const lastWatchedByTitle = new Map<string, string>();
  let start = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("watched_episodes")
      .select("title_id, watched_at")
      .range(start, start + pageSize - 1);
    if (error) throw error;

    const page = (data ?? []) as WatchedEpisodeRow[];
    for (const row of page) {
      countByTitle.set(row.title_id, (countByTitle.get(row.title_id) ?? 0) + 1);
      if (row.watched_at) {
        const current = lastWatchedByTitle.get(row.title_id);
        if (!current || row.watched_at > current) {
          lastWatchedByTitle.set(row.title_id, row.watched_at);
        }
      }
    }

    if (page.length < pageSize) break;
    start += pageSize;
  }

  return { countByTitle, lastWatchedByTitle };
}

interface UserTitleSeedRow {
  title_id: string;
  status: WatchStatus;
  rating: number | null;
  titles: {
    source: DataSource;
    source_id: string;
    media_type: MediaType;
    total_episodes: number | null;
    title: string;
  } | null;
}

// Every tracked title, weighting-ready. `trackedKeys` (the full 198-title
// set, not just the seeds selectSeeds later picks) is what excludeKnownTitles
// uses — a title must never be recommended just because it wasn't chosen as
// a seed this run. `trackedTitles` is the raw title text of every tracked
// title, for excludeFranchiseSequels.
async function loadSeeds(
  supabase: SupabaseClient,
): Promise<{ seeds: SeedInput[]; trackedKeys: Set<string>; trackedTitles: string[] }> {
  const [{ data, error }, watched, favoriteIds] = await Promise.all([
    supabase
      .from("user_titles")
      .select(
        "title_id, status, rating, titles(source, source_id, media_type, total_episodes, title)",
      ),
    loadWatchedAggregates(supabase),
    getFavoriteTitleIds(supabase),
  ]);
  if (error) throw error;

  const rows = (data ?? []) as UserTitleSeedRow[];
  const seeds: SeedInput[] = [];
  const trackedKeys = new Set<string>();
  const trackedTitles: string[] = [];

  for (const row of rows) {
    if (!row.titles) continue; // orphaned row — shouldn't happen, skip defensively
    trackedKeys.add(titleKey(row.titles.source, row.titles.source_id, row.titles.media_type));
    trackedTitles.push(row.titles.title);
    seeds.push({
      titleId: row.title_id,
      sourceId: row.titles.source_id,
      mediaType: row.titles.media_type,
      status: row.status,
      rating: row.rating,
      isFavorite: favoriteIds.has(row.title_id),
      watchedEpisodes: watched.countByTitle.get(row.title_id) ?? 0,
      totalEpisodes: row.titles.total_episodes,
      lastWatchedAt: watched.lastWatchedByTitle.get(row.title_id) ?? null,
    });
  }

  return { seeds, trackedKeys, trackedTitles };
}

interface DismissalRow {
  source: DataSource;
  source_id: string;
  media_type: MediaType;
}

async function loadDismissedKeys(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("rec_dismissals")
    .select("source, source_id, media_type");
  if (error) throw error;
  return new Set(
    ((data ?? []) as DismissalRow[]).map((r) => titleKey(r.source, r.source_id, r.media_type)),
  );
}

// ---- fetching + merging candidates -----------------------------------------

export interface CandidateFetchError {
  seedId: string;
  message: string;
}

// Fetches TMDB recommendations per seed (bounded concurrency) and merges
// duplicate candidates across seeds into one CandidateInput per title, each
// carrying every seed that recommended it. This merge is the core of the
// feature: co-occurrence across seeds is scoreCandidates' primary signal, so
// a title recommended by five seeds must reach it as one candidate with five
// `recommendedBy` entries, never as five separate candidates.
// Exported (not just used internally by buildRecommendations) so the merge
// behavior can be asserted directly in tests without exercising the full
// Supabase read/write pipeline around it.
export async function fetchAndMergeCandidates(
  weightedSeeds: WeightedSeed[],
): Promise<{ merged: Map<string, CandidateInput>; errors: CandidateFetchError[] }> {
  const merged = new Map<string, CandidateInput>();
  const errors: CandidateFetchError[] = [];

  await mapWithConcurrency(weightedSeeds, CANDIDATE_FETCH_CONCURRENCY, async (ws) => {
    let raw: RecommendationCandidate[];
    try {
      raw = await getRecommendationCandidates(ws.seed.sourceId, ws.seed.mediaType);
    } catch (err) {
      // One seed's TMDB call failing must never abort the whole run.
      errors.push({
        seedId: ws.seed.titleId,
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    for (const c of raw) {
      const key = titleKey(c.source, c.sourceId, c.mediaType);
      let entry = merged.get(key);
      if (!entry) {
        entry = {
          source: c.source,
          sourceId: c.sourceId,
          mediaType: c.mediaType,
          title: c.title,
          posterUrl: c.posterUrl,
          year: c.year,
          overview: c.overview,
          voteCount: c.voteCount,
          voteAverage: c.voteAverage,
          popularity: c.popularity,
          recommendedBy: [],
        };
        merged.set(key, entry);
      }
      const source: RecommendationSource = { seedId: ws.seed.titleId, weight: ws.weight, rank: c.rank };
      entry.recommendedBy.push(source);
    }
  });

  return { merged, errors };
}

// ---- rail assignment + writes ----------------------------------------------

interface RecommendationRow {
  source: DataSource;
  source_id: string;
  media_type: MediaType;
  title: string;
  poster_url: string | null;
  overview: string | null;
  year: number | null;
  score: number;
  rail: string;
  seed_title_id: string | null;
}

function toRow(scored: ScoredCandidate, rail: string, seedTitleId: string | null): RecommendationRow {
  const c = scored.candidate;
  return {
    source: c.source,
    source_id: c.sourceId,
    media_type: c.mediaType,
    title: c.title,
    poster_url: c.posterUrl,
    overview: c.overview,
    year: c.year,
    score: scored.score,
    rail,
    seed_title_id: seedTitleId,
  };
}

function rowKey(r: { rail: string; source: string; source_id: string; media_type: string }): string {
  return `${r.rail}::${r.source}::${r.source_id}::${r.media_type}`;
}

export interface BuildRecommendationsSummary {
  seedsUsed: number;
  candidatesConsidered: number;
  railCounts: Record<string, number>;
  errors: CandidateFetchError[];
}

// Recomputes and persists the owner's Explore rails. `userId` isn't needed
// for query scoping (RLS + the `user_id` column default handle that, same as
// every other write path in lib/api/) — it's used to explicitly scope the
// stale-row cleanup below, the same defense-in-depth pattern DELETE
// /api/titles/:titleId uses.
export async function buildRecommendations(
  supabase: SupabaseClient,
  userId: string,
): Promise<BuildRecommendationsSummary> {
  const [{ seeds: allSeeds, trackedKeys, trackedTitles }, dismissedKeys] = await Promise.all([
    loadSeeds(supabase),
    loadDismissedKeys(supabase),
  ]);

  const weightedSeeds = selectSeeds(allSeeds, new Date());
  const { merged, errors } = await fetchAndMergeCandidates(weightedSeeds);

  const excludedKeys = new Set([...trackedKeys, ...dismissedKeys]);
  const eligible = excludeKnownTitles(Array.from(merged.values()), excludedKeys);
  const floored = applyVoteFloor(eligible, VOTE_FLOOR_MIN_RESULTS);
  const deduped = excludeFranchiseSequels(scoreCandidates(floored), trackedTitles);
  const scored = deduped.sort((a, b) => b.score - a.score);

  const rows: RecommendationRow[] = [];
  const railCounts: Record<string, number> = {};

  for (const mediaType of MEDIA_TYPES) {
    const rail = `for_you_${mediaType}`;
    const top = scored.filter((s) => s.candidate.mediaType === mediaType).slice(0, FOR_YOU_RAIL_SIZE);
    railCounts[rail] = top.length;
    rows.push(...top.map((s) => toRow(s, rail, null)));
  }

  // "Because you finished X" rails: up to BECAUSE_RAIL_COUNT, one per
  // highest-weighted completed seed, each holding that seed's own top
  // candidates. The rail key embeds the seed's titleId — recommendations'
  // unique constraint is (user_id, rail, source, source_id, media_type), so
  // a shared "because" label would collide the moment two seeds recommend
  // the same title.
  const becauseSeeds = weightedSeeds
    .filter((ws) => ws.seed.status === "completed")
    .sort((a, b) => b.weight - a.weight)
    .slice(0, BECAUSE_RAIL_COUNT);

  for (const ws of becauseSeeds) {
    const rail = `because:${ws.seed.titleId}`;
    const top = scored
      .filter((s) => s.candidate.recommendedBy.some((r) => r.seedId === ws.seed.titleId))
      .slice(0, BECAUSE_RAIL_SIZE);
    railCounts[rail] = top.length;
    rows.push(...top.map((s) => toRow(s, rail, ws.seed.titleId)));
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("recommendations")
      .upsert(rows, { onConflict: "user_id,rail,source,source_id,media_type" });
    if (upsertError) throw upsertError;
  }

  // Drop stale rows this run didn't produce, so candidates that fell out of
  // the ranking disappear — never touches rec_dismissals, which is a
  // permanent "don't show me this" record, not a cache (see the migration).
  const keepKeys = new Set(rows.map(rowKey));
  const { data: existingRows, error: existingError } = await supabase
    .from("recommendations")
    .select("id, rail, source, source_id, media_type");
  if (existingError) throw existingError;

  const staleIds = ((existingRows ?? []) as { id: string; rail: string; source: string; source_id: string; media_type: string }[])
    .filter((r) => !keepKeys.has(rowKey(r)))
    .map((r) => r.id);

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("recommendations")
      .delete()
      .in("id", staleIds)
      .eq("user_id", userId);
    if (deleteError) throw deleteError;
  }

  return {
    seedsUsed: weightedSeeds.length,
    candidatesConsidered: merged.size,
    railCounts,
    errors,
  };
}
