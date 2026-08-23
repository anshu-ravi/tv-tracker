import { describe, expect, it } from "vitest";
import {
  organizeRecommendationRails,
  shouldShowEmptyRecommendationsState,
} from "@/lib/exploreRails";
import type { RecommendationItem, RecommendationRail } from "@/lib/types";

function item(sourceId: string): RecommendationItem {
  return {
    source: "tmdb",
    sourceId,
    mediaType: "tv",
    title: `Title ${sourceId}`,
    posterUrl: null,
    overview: null,
    year: 2020,
    score: 1,
  };
}

function rail(overrides: Partial<RecommendationRail> = {}): RecommendationRail {
  return {
    rail: "for_you_tv",
    seedTitle: null,
    items: [item("1")],
    ...overrides,
  };
}

describe("organizeRecommendationRails", () => {
  it("drops a because rail with no items rather than heading over nothing", () => {
    const empty = rail({ rail: "because:seed-1", seedTitle: { titleId: "seed-1", title: "Naruto", posterUrl: null }, items: [] });
    const populated = rail({ rail: "because:seed-2", seedTitle: { titleId: "seed-2", title: "Bleach", posterUrl: null } });

    const { becauseRails } = organizeRecommendationRails([empty, populated]);

    expect(becauseRails.map((r) => r.rail)).toEqual(["because:seed-2"]);
  });

  it("drops a because rail with no seedTitle", () => {
    const noSeed = rail({ rail: "because:seed-1", seedTitle: null });

    const { becauseRails } = organizeRecommendationRails([noSeed]);

    expect(becauseRails).toEqual([]);
  });

  it("orders for_you rails tv, anime, movie and drops any that are empty", () => {
    const movie = rail({ rail: "for_you_movie" });
    const tv = rail({ rail: "for_you_tv" });
    const anime = rail({ rail: "for_you_anime", items: [] }); // empty -- must be dropped

    const { forYouRails } = organizeRecommendationRails([movie, tv, anime]);

    expect(forYouRails.map((r) => r.rail)).toEqual(["for_you_tv", "for_you_movie"]);
  });

  it("returns empty groups for an empty input (e.g. a failed fetch)", () => {
    expect(organizeRecommendationRails([])).toEqual({ becauseRails: [], forYouRails: [] });
  });
});

describe("shouldShowEmptyRecommendationsState", () => {
  it("is false while still loading", () => {
    expect(
      shouldShowEmptyRecommendationsState({ loading: true, fetchFailed: false, railCount: 0 }),
    ).toBe(false);
  });

  it("is false when the fetch failed -- trending rails are the fallback there, not this prompt", () => {
    expect(
      shouldShowEmptyRecommendationsState({ loading: false, fetchFailed: true, railCount: 0 }),
    ).toBe(false);
  });

  it("is true only once loading has finished, the fetch succeeded, and there are no rails", () => {
    expect(
      shouldShowEmptyRecommendationsState({ loading: false, fetchFailed: false, railCount: 0 }),
    ).toBe(true);
  });

  it("is false once there is at least one rail", () => {
    expect(
      shouldShowEmptyRecommendationsState({ loading: false, fetchFailed: false, railCount: 2 }),
    ).toBe(false);
  });
});
