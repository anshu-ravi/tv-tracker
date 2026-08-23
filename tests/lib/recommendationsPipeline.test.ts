import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeSupabaseClient } from "../helpers/fakeSupabase";
import type { WeightedSeed } from "@/lib/recommendations";
import type { RecommendationCandidate } from "@/lib/tmdb";

const { mockGetRecommendationCandidates } = vi.hoisted(() => ({
  mockGetRecommendationCandidates: vi.fn(),
}));

vi.mock("@/lib/tmdb", async (importOriginal) => {
  // scoreCandidates (lib/recommendations.ts, exercised for real by
  // buildRecommendations below) imports rankingScore from this module too —
  // keep the real implementation so scoring still works under the mock.
  const actual = await importOriginal<typeof import("@/lib/tmdb")>();
  return { ...actual, getRecommendationCandidates: mockGetRecommendationCandidates };
});

afterEach(() => {
  vi.clearAllMocks();
});

function candidate(sourceId: string, rank: number): RecommendationCandidate {
  return {
    source: "tmdb",
    sourceId,
    mediaType: "tv",
    title: `Title ${sourceId}`,
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    year: 2020,
    overview: null,
    voteCount: 0,
    voteAverage: 0,
    popularity: 0,
    rank,
  };
}

function weightedSeed(titleId: string, weight: number): WeightedSeed {
  return {
    weight,
    seed: {
      titleId,
      sourceId: titleId,
      mediaType: "tv",
      status: "completed",
      rating: null,
      isFavorite: false,
      watchedEpisodes: 10,
      totalEpisodes: 10,
      lastWatchedAt: null,
    },
  };
}

describe("fetchAndMergeCandidates", () => {
  it("merges a candidate recommended by three seeds into one CandidateInput with three recommendedBy entries", async () => {
    const { fetchAndMergeCandidates } = await import("@/lib/api/recommendations");

    mockGetRecommendationCandidates.mockImplementation(async (sourceId: string) => {
      if (sourceId === "seed-a") return [candidate("shared", 0), candidate("only-a", 1)];
      if (sourceId === "seed-b") return [candidate("shared", 0), candidate("only-b", 1)];
      if (sourceId === "seed-c") return [candidate("shared", 2)];
      return [];
    });

    const seeds = [
      weightedSeed("seed-a", 1.0),
      weightedSeed("seed-b", 0.9),
      weightedSeed("seed-c", 0.5),
    ];

    const { merged, errors } = await fetchAndMergeCandidates(seeds);

    expect(errors).toEqual([]);
    const shared = merged.get("tmdb:tv:shared");
    expect(shared).toBeDefined();
    expect(shared!.recommendedBy).toHaveLength(3);
    expect(shared!.recommendedBy.map((r) => r.seedId).sort()).toEqual([
      "seed-a",
      "seed-b",
      "seed-c",
    ]);
    expect(shared!.recommendedBy.map((r) => r.rank).sort()).toEqual([0, 0, 2]);

    // Candidates seen by only one seed stay their own single-source entries.
    expect(merged.get("tmdb:tv:only-a")!.recommendedBy).toHaveLength(1);
    expect(merged.get("tmdb:tv:only-b")!.recommendedBy).toHaveLength(1);
    expect(merged.size).toBe(3);
  });

  it("does not abort the run when one seed's TMDB fetch throws", async () => {
    const { fetchAndMergeCandidates } = await import("@/lib/api/recommendations");

    mockGetRecommendationCandidates.mockImplementation(async (sourceId: string) => {
      if (sourceId === "seed-bad") throw new Error("TMDB is down");
      return [candidate(`from-${sourceId}`, 0)];
    });

    const seeds = [
      weightedSeed("seed-a", 1.0),
      weightedSeed("seed-bad", 0.9),
      weightedSeed("seed-c", 0.5),
    ];

    const { merged, errors } = await fetchAndMergeCandidates(seeds);

    expect(errors).toEqual([{ seedId: "seed-bad", message: "TMDB is down" }]);
    expect(merged.has("tmdb:tv:from-seed-a")).toBe(true);
    expect(merged.has("tmdb:tv:from-seed-c")).toBe(true);
  });
});

// ---- buildRecommendations: full pipeline over a fake Supabase client -------

interface UserTitleFixture {
  title_id: string;
  status: string;
  rating: number | null;
  source_id: string;
}

function userTitleRow(f: UserTitleFixture) {
  return {
    title_id: f.title_id,
    status: f.status,
    rating: f.rating,
    titles: { source: "tmdb", source_id: f.source_id, media_type: "tv", total_episodes: 10 },
  };
}

// Builds a fake Supabase client wired for buildRecommendations: one
// completed seed ("seed-a") backing user_titles, no watched-episode rows
// (irrelevant to these pipeline-level tests, which focus on exclusion/
// staleness, not seed weighting), no favorites list, and configurable
// dismissals / pre-existing recommendation rows.
function buildFakeSupabase(opts: {
  dismissed?: { source: string; source_id: string; media_type: string }[];
  existingRecommendations?: { id: string; rail: string; source: string; source_id: string; media_type: string }[];
  extraSeeds?: UserTitleFixture[];
} = {}): FakeSupabaseClient {
  const seeds = [
    { title_id: "seed-a-titleid", status: "completed", rating: null, source_id: "seed-a" },
    ...(opts.extraSeeds ?? []),
  ];

  return createFakeSupabase({
    user: { id: "user-1" },
    tableResults: {
      user_titles: { data: seeds.map(userTitleRow), error: null },
      watched_episodes: { data: [], error: null },
      lists: { data: null, error: null },
      rec_dismissals: { data: opts.dismissed ?? [], error: null },
      recommendations: [
        { data: null, error: null }, // upsert
        { data: opts.existingRecommendations ?? [], error: null }, // select existing (staleness check)
        { data: null, error: null }, // delete stale
      ],
    },
  });
}

function upsertedRows(fake: FakeSupabaseClient): Record<string, unknown>[] {
  const builder = fake.builders.recommendations[0];
  const call = builder.calls.find((c) => c.method === "upsert");
  return (call?.args[0] as Record<string, unknown>[]) ?? [];
}

describe("buildRecommendations", () => {
  it("excludes an already-tracked title and a dismissed title from the written rows", async () => {
    const { buildRecommendations } = await import("@/lib/api/recommendations");

    mockGetRecommendationCandidates.mockImplementation(async (sourceId: string) => {
      if (sourceId !== "seed-a") return [];
      return [
        candidate("tracked-elsewhere", 0), // key collides with extraSeeds below
        candidate("dismissed-title", 1),
        candidate("keep-me", 2),
      ];
    });

    const fake = buildFakeSupabase({
      dismissed: [{ source: "tmdb", source_id: "dismissed-title", media_type: "tv" }],
      extraSeeds: [
        { title_id: "other-titleid", status: "watching", rating: null, source_id: "tracked-elsewhere" },
      ],
    });

    await buildRecommendations(fake, "user-1");

    const rows = upsertedRows(fake);
    const sourceIds = rows.map((r) => r.source_id);
    expect(sourceIds).toContain("keep-me");
    expect(sourceIds).not.toContain("tracked-elsewhere");
    expect(sourceIds).not.toContain("dismissed-title");
  });

  it("deletes stale recommendation rows on recompute but never touches rec_dismissals", async () => {
    const { buildRecommendations } = await import("@/lib/api/recommendations");

    mockGetRecommendationCandidates.mockImplementation(async (sourceId: string) => {
      if (sourceId !== "seed-a") return [];
      return [candidate("still-recommended", 0)];
    });

    const fake = buildFakeSupabase({
      existingRecommendations: [
        {
          id: "stale-row-id",
          rail: "for_you_tv",
          source: "tmdb",
          source_id: "no-longer-recommended",
          media_type: "tv",
        },
        {
          id: "kept-row-id",
          rail: "for_you_tv",
          source: "tmdb",
          source_id: "still-recommended",
          media_type: "tv",
        },
      ],
    });

    await buildRecommendations(fake, "user-1");

    const deleteBuilder = fake.builders.recommendations[2];
    const deleteCall = deleteBuilder.calls.find((c) => c.method === "in");
    expect(deleteCall?.args).toEqual(["id", ["stale-row-id"]]);

    // rec_dismissals is only ever read, never deleted from.
    const dismissalCalls = fake.builders.rec_dismissals.flatMap((b) => b.calls.map((c) => c.method));
    expect(dismissalCalls).not.toContain("delete");
  });

  it("does not abort the run when one seed's TMDB fetch throws, and reports the error", async () => {
    const { buildRecommendations } = await import("@/lib/api/recommendations");

    mockGetRecommendationCandidates.mockImplementation(async (sourceId: string) => {
      if (sourceId === "seed-a") throw new Error("TMDB is down");
      return [candidate("from-other-seed", 0)];
    });

    const fake = buildFakeSupabase({
      extraSeeds: [
        { title_id: "other-titleid", status: "completed", rating: null, source_id: "seed-other" },
      ],
    });

    const summary = await buildRecommendations(fake, "user-1");

    expect(summary.errors).toEqual([{ seedId: "seed-a-titleid", message: "TMDB is down" }]);
    const rows = upsertedRows(fake);
    expect(rows.map((r) => r.source_id)).toContain("from-other-seed");
  });
});
