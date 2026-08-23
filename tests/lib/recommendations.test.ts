import { describe, expect, it } from "vitest";
import {
  applyVoteFloor,
  excludeFranchiseSequels,
  excludeKnownTitles,
  FRANCHISE_MIN_TRACKED_TITLE_LENGTH,
  positionDecay,
  RECENCY_FLOOR,
  RECENCY_UNKNOWN,
  scoreCandidates,
  SEED_COUNT_ANIME,
  SEED_COUNT_MOVIE,
  SEED_COUNT_TV,
  seedWeight,
  selectSeeds,
  type CandidateInput,
  type ScoredCandidate,
  type SeedInput,
} from "@/lib/recommendations";
import { titleKey, type MediaType } from "@/lib/types";

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

    expect(older).toBeLessThan(recent);
    expect(ancient).toBeCloseTo(RECENCY_FLOOR, 5);
  });

  it("treats an unknown lastWatchedAt as a retrospective complete, not an ancient watch", () => {
    // A null date means "watched, but date unknown" -- roughly the same
    // vintage as the bulk-imported titles, so it must land above the floor
    // and, crucially, above a title known to be genuinely years old.
    const nullDate = seedWeight(seed({ lastWatchedAt: null }), NOW);
    const veryOld = new Date(NOW);
    veryOld.setFullYear(veryOld.getFullYear() - 20);
    const ancient = seedWeight(seed({ lastWatchedAt: veryOld.toISOString() }), NOW);

    expect(nullDate).toBeCloseTo(RECENCY_UNKNOWN, 5);
    expect(nullDate).toBeGreaterThan(ancient);
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

describe("completionFactor for movies", () => {
  it("scores a completed movie with a null totalEpisodes the same as a fully-watched TV title", () => {
    const completedMovie = seedWeight(
      seed({ mediaType: "movie", status: "completed", watchedEpisodes: 1, totalEpisodes: null }),
      NOW,
    );
    const completedTv = seedWeight(
      seed({ mediaType: "tv", status: "completed", watchedEpisodes: 10, totalEpisodes: 10 }),
      NOW,
    );

    expect(completedMovie).toBeCloseTo(completedTv, 10);
  });

  it("does not give an unwatched watchlist movie a full completion factor", () => {
    const watchlistMovie = seedWeight(
      seed({ mediaType: "movie", status: "watchlist", watchedEpisodes: 0, totalEpisodes: null }),
      NOW,
    );
    const completedMovie = seedWeight(
      seed({ mediaType: "movie", status: "completed", watchedEpisodes: 1, totalEpisodes: null }),
      NOW,
    );

    // Both use the completion floor vs. full completion, so a never-watched
    // watchlist movie must land well under a fully-watched one.
    expect(watchlistMovie).toBeGreaterThan(0);
    expect(watchlistMovie).toBeLessThan(completedMovie);
  });
});

function manyOfType(mediaType: MediaType, n: number, overrides: Partial<SeedInput> = {}): SeedInput[] {
  return Array.from({ length: n }, (_, i) =>
    seed({ titleId: `${mediaType}-${i}`, mediaType, ...overrides }),
  );
}

describe("selectSeeds", () => {
  it("caps the result at the given per-media-type count and keeps a strong negative seed in the selection", () => {
    const strongNegative = seed({
      titleId: "negative",
      mediaType: "tv",
      status: "dnf",
      isFavorite: true,
      watchedEpisodes: 10,
      totalEpisodes: 10,
    });
    const manyWeak = manyOfType("tv", 40, { status: "watchlist" });

    const selected = selectSeeds([strongNegative, ...manyWeak], NOW, { tv: 5, anime: 0, movie: 0 });

    expect(selected).toHaveLength(5);
    expect(selected.some((s) => s.seed.titleId === "negative")).toBe(true);
  });

  it("selects the top N per media type independently, so TV titles never crowd out a movie seed", () => {
    // More completed/favorited TV seeds than SEED_COUNT_TV, all far
    // outweighing one low-weight watchlist movie -- a single global top-N
    // cutoff would drop the movie entirely; per-media-type selection must
    // not.
    const strongTv = manyOfType("tv", SEED_COUNT_TV + 5, { status: "completed", isFavorite: true });
    const weakMovie = seed({ titleId: "movie-1", mediaType: "movie", status: "watchlist" });

    const selected = selectSeeds([...strongTv, weakMovie], NOW);

    expect(selected.filter((s) => s.seed.mediaType === "tv")).toHaveLength(SEED_COUNT_TV);
    expect(selected.some((s) => s.seed.titleId === "movie-1")).toBe(true);
  });

  it("uses SEED_COUNT_TV / SEED_COUNT_ANIME / SEED_COUNT_MOVIE as the default per-type quotas", () => {
    const seeds = [
      ...manyOfType("tv", 20, { status: "completed" }),
      ...manyOfType("anime", 20, { status: "completed" }),
      ...manyOfType("movie", 20, { status: "completed" }),
    ];

    const selected = selectSeeds(seeds, NOW);

    expect(selected.filter((s) => s.seed.mediaType === "tv")).toHaveLength(SEED_COUNT_TV);
    expect(selected.filter((s) => s.seed.mediaType === "anime")).toHaveLength(SEED_COUNT_ANIME);
    expect(selected.filter((s) => s.seed.mediaType === "movie")).toHaveLength(SEED_COUNT_MOVIE);
  });

  it("contributes fewer seeds, never backfilled from another type, when short of its quota", () => {
    const selected = selectSeeds(
      [seed({ titleId: "only-movie", mediaType: "movie", status: "completed" })],
      NOW,
    );

    expect(selected).toHaveLength(1);
    expect(selected[0].seed.titleId).toBe("only-movie");
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

  it("scores a high-vote-count hub candidate lower than a low-vote-count one with an identical co-occurrence sum", () => {
    const recommendedBy = [
      { seedId: "s1", weight: 1.0, rank: 0 },
      { seedId: "s2", weight: 1.0, rank: 0 },
    ];
    const hub = candidate({ sourceId: "hub", voteCount: 200000, recommendedBy });
    const niche = candidate({ sourceId: "niche", voteCount: 20, recommendedBy });

    const [scoredHub, scoredNiche] = scoreCandidates([hub, niche]);

    // Same raw signal, so this isolates the hub-damping inversion.
    expect(scoredHub.coOccurrenceScore).toBeCloseTo(scoredNiche.coOccurrenceScore, 10);
    expect(scoredHub.score).toBeLessThan(scoredNiche.score);
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

function scored(overrides: Partial<CandidateInput> = {}, score = 1): ScoredCandidate {
  return {
    candidate: candidate(overrides),
    coOccurrenceScore: score,
    score,
  };
}

describe("excludeFranchiseSequels", () => {
  it("drops a franchise continuation whose title contains a tracked title as a whole word", () => {
    const boruto = scored({ sourceId: "boruto", title: "Boruto: Naruto Next Generations" });
    const unrelated = scored({ sourceId: "aot", title: "Attack on Titan" });

    const result = excludeFranchiseSequels([boruto, unrelated], ["Naruto"]);

    expect(result.map((r) => r.candidate.sourceId)).toEqual(["aot"]);
  });

  it("does not let a tracked title shorter than the length guard eliminate unrelated candidates", () => {
    expect("Dark".length).toBeLessThan(FRANCHISE_MIN_TRACKED_TITLE_LENGTH);
    const darkMatter = scored({ sourceId: "dark-matter", title: "Dark Matter" });

    const result = excludeFranchiseSequels([darkMatter], ["Dark"]);

    expect(result.map((r) => r.candidate.sourceId)).toEqual(["dark-matter"]);
  });

  it("collapses duplicate candidates with the same normalized title, keeping the higher-scoring one", () => {
    const lowerScored = scored({ sourceId: "ranma-old", title: "Ranma ½" }, 1);
    const higherScored = scored({ sourceId: "ranma-new", title: "Ranma ½" }, 5);

    const result = excludeFranchiseSequels([lowerScored, higherScored], []);

    expect(result).toHaveLength(1);
    expect(result[0].candidate.sourceId).toBe("ranma-new");
    expect(result[0].score).toBe(5);
  });

  it("keeps a genuinely unrelated candidate untouched", () => {
    const unrelated = scored({ sourceId: "peripheral", title: "The Peripheral" });

    const result = excludeFranchiseSequels([unrelated], ["Naruto", "Pantheon", "Code Geass"]);

    expect(result.map((r) => r.candidate.sourceId)).toEqual(["peripheral"]);
  });
});
