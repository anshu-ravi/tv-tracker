import { describe, expect, it } from "vitest";
import {
  applyVoteFloor,
  excludeKnownTitles,
  positionDecay,
  scoreCandidates,
  seedWeight,
  selectSeeds,
  type CandidateInput,
  type SeedInput,
} from "@/lib/recommendations";
import { titleKey } from "@/lib/types";

const NOW = new Date("2026-08-23T00:00:00Z");

function seed(overrides: Partial<SeedInput> = {}): SeedInput {
  return {
    titleId: "t1",
    sourceId: "1",
    mediaType: "tv",
    status: "completed",
    rating: null,
    isFavorite: false,
    watchedEpisodes: 10,
    totalEpisodes: 10,
    lastWatchedAt: NOW.toISOString(),
    ...overrides,
  };
}

describe("seedWeight", () => {
  it("orders status bases as completed > watching > watchlist > dnf", () => {
    const completed = seedWeight(seed({ status: "completed" }), NOW);
    const watching = seedWeight(seed({ status: "watching" }), NOW);
    const watchlist = seedWeight(seed({ status: "watchlist" }), NOW);
    const dnf = seedWeight(seed({ status: "dnf" }), NOW);

    expect(completed).toBeGreaterThan(watching);
    expect(watching).toBeGreaterThan(watchlist);
    expect(watchlist).toBeGreaterThan(dnf);
    expect(dnf).toBeLessThan(0);
  });

  it("lets an explicit rating override the status base entirely", () => {
    const lowRatedCompleted = seedWeight(
      seed({ status: "completed", rating: 1.0 }),
      NOW,
    );
    expect(lowRatedCompleted).toBeLessThan(0);

    // Same rating, different status bases -- weight should be identical
    // (modulo completion/recency/favorite factors, held equal here), proving
    // the status base plays no part once a rating is present.
    const ratedWatching = seedWeight(
      seed({ status: "watching", rating: 4.0 }),
      NOW,
    );
    const ratedDnf = seedWeight(seed({ status: "dnf", rating: 4.0 }), NOW);
    expect(ratedWatching).toBeCloseTo(ratedDnf, 10);
  });

  it("maps a 4.5 rating to a 0.75 base weight", () => {
    // Full completion, no favorite boost, at the recency reference point
    // (factor 1.0) isolates the rating-derived base weight.
    const weight = seedWeight(seed({ rating: 4.5, lastWatchedAt: NOW.toISOString() }), NOW);
    expect(weight).toBeCloseTo(0.75, 5);
  });

  it("keeps a non-zero weight at zero watched episodes (completion floor)", () => {
    const weight = seedWeight(
      seed({ status: "watching", watchedEpisodes: 0, totalEpisodes: 24 }),
      NOW,
    );
    expect(weight).toBeGreaterThan(0);
  });

  it("does not divide by zero or produce NaN when totalEpisodes is null", () => {
    const weight = seedWeight(
      seed({ watchedEpisodes: 5, totalEpisodes: null }),
      NOW,
    );
    expect(Number.isNaN(weight)).toBe(false);
    expect(weight).toBeGreaterThan(0);
  });

  it("decays weight for an older lastWatchedAt but never below the floor", () => {
    const recent = seedWeight(
      seed({ lastWatchedAt: NOW.toISOString() }),
      NOW,
    );
    const oneYearAgo = new Date(NOW);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const older = seedWeight(seed({ lastWatchedAt: oneYearAgo.toISOString() }), NOW);
    const veryOld = new Date(NOW);
    veryOld.setFullYear(veryOld.getFullYear() - 20);
    const ancient = seedWeight(seed({ lastWatchedAt: veryOld.toISOString() }), NOW);
    const nullDate = seedWeight(seed({ lastWatchedAt: null }), NOW);

    expect(older).toBeLessThan(recent);
    expect(ancient).toBeGreaterThanOrEqual(nullDate * 0.999);
    expect(ancient).toBeCloseTo(nullDate, 5);
  });

  it("keeps a favorite, high-completion DNF seed negative and more negative than a plain DNF", () => {
    const plainDnf = seedWeight(
      seed({ status: "dnf", isFavorite: false, watchedEpisodes: 10, totalEpisodes: 10 }),
      NOW,
    );
    const favoriteDnf = seedWeight(
      seed({ status: "dnf", isFavorite: true, watchedEpisodes: 10, totalEpisodes: 10 }),
      NOW,
    );

    expect(favoriteDnf).toBeLessThan(0);
    expect(favoriteDnf).toBeLessThan(plainDnf);
  });
});

describe("selectSeeds", () => {
  it("caps the result at N and keeps a strong negative seed in the selection", () => {
    const strongNegative = seed({
      titleId: "negative",
      status: "dnf",
      isFavorite: true,
      watchedEpisodes: 10,
      totalEpisodes: 10,
    });
    const manyWeak = Array.from({ length: 40 }, (_, i) =>
      seed({ titleId: `weak-${i}`, status: "watchlist" }),
    );

    const selected = selectSeeds([strongNegative, ...manyWeak], NOW, 5);

    expect(selected).toHaveLength(5);
    expect(selected.some((s) => s.seed.titleId === "negative")).toBe(true);
  });
});

describe("positionDecay", () => {
  it("gives an earlier rank more weight than a later one", () => {
    expect(positionDecay(0)).toBe(1);
    expect(positionDecay(0)).toBeGreaterThan(positionDecay(19));
    expect(positionDecay(19)).toBeGreaterThan(0);
  });
});

function candidate(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    source: "tmdb",
    sourceId: "100",
    mediaType: "tv",
    title: "Candidate Show",
    posterUrl: null,
    year: 2020,
    overview: null,
    voteCount: 100,
    voteAverage: 7,
    popularity: 20,
    recommendedBy: [],
    ...overrides,
  };
}

describe("scoreCandidates", () => {
  it("lets co-occurrence across strong seeds dominate a single-seed candidate with far better quality stats", () => {
    const popularSingleSeed: CandidateInput = candidate({
      sourceId: "popular",
      voteCount: 50000,
      voteAverage: 9,
      popularity: 5000,
      recommendedBy: [{ seedId: "s1", weight: 1.0, rank: 0 }],
    });
    const nicheMultiSeed: CandidateInput = candidate({
      sourceId: "niche",
      voteCount: 20,
      voteAverage: 6,
      popularity: 5,
      recommendedBy: [
        { seedId: "s1", weight: 1.0, rank: 0 },
        { seedId: "s2", weight: 0.9, rank: 1 },
        { seedId: "s3", weight: 0.8, rank: 0 },
      ],
    });

    const [scoredPopular, scoredNiche] = scoreCandidates([
      popularSingleSeed,
      nicheMultiSeed,
    ]);

    expect(scoredNiche.score).toBeGreaterThan(scoredPopular.score);
  });

  it("gives a candidate recommended at rank 0 a higher co-occurrence score than the same seed at rank 19", () => {
    const early = candidate({
      sourceId: "early",
      recommendedBy: [{ seedId: "s1", weight: 1.0, rank: 0 }],
    });
    const late = candidate({
      sourceId: "late",
      recommendedBy: [{ seedId: "s1", weight: 1.0, rank: 19 }],
    });

    const [scoredEarly, scoredLate] = scoreCandidates([early, late]);

    expect(scoredEarly.coOccurrenceScore).toBeGreaterThan(scoredLate.coOccurrenceScore);
  });
});

describe("applyVoteFloor", () => {
  it("relaxes down to the lowest floor rather than returning an empty list", () => {
    const candidates = [
      { voteCount: 10 },
      { voteCount: 20 },
      { voteCount: 5 },
    ];

    const result = applyVoteFloor(candidates, 2);

    expect(result.length).toBeGreaterThan(0);
    expect(result).toHaveLength(3);
  });
});

describe("excludeKnownTitles", () => {
  it("drops already-tracked and dismissed candidates matched via titleKey", () => {
    const tracked = candidate({ sourceId: "tracked-id" });
    const dismissed = candidate({ sourceId: "dismissed-id" });
    const keep = candidate({ sourceId: "keep-id" });

    const excludedKeys = new Set([
      titleKey(tracked.source, tracked.sourceId, tracked.mediaType),
      titleKey(dismissed.source, dismissed.sourceId, dismissed.mediaType),
    ]);

    const result = excludeKnownTitles([tracked, dismissed, keep], excludedKeys);

    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe("keep-id");
  });
});
