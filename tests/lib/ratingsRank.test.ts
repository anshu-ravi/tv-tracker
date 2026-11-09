import { describe, expect, it } from "vitest";
import { rankRatings, type RatedTitle } from "@/lib/ratingsRank";

const t = (title: string, rating: number, mediaType: RatedTitle["mediaType"] = "tv"): RatedTitle => ({
  titleId: title,
  title,
  posterUrl: null,
  mediaType,
  rating,
});

const items = [
  t("Severance", 4.5),
  t("Frieren", 4.9, "anime"),
  t("Arrival", 4.5, "movie"),
  t("Dune", 3.2, "movie"),
  t("Bleach", 4.5, "anime"),
];

describe("rankRatings", () => {
  it("sorts high to low with shared ranks and alphabetical ties", () => {
    const ranked = rankRatings(items, "all", "desc");
    expect(ranked.map((r) => [r.title, r.rank])).toEqual([
      ["Frieren", 1],
      ["Arrival", 2],
      ["Bleach", 2],
      ["Severance", 2],
      ["Dune", 5],
    ]);
  });

  it("sorts low to high, ranking from the bottom", () => {
    const ranked = rankRatings(items, "all", "asc");
    expect(ranked.map((r) => [r.title, r.rank])).toEqual([
      ["Dune", 1],
      ["Arrival", 2],
      ["Bleach", 2],
      ["Severance", 2],
      ["Frieren", 5],
    ]);
  });

  it("filters by media type and ranks within the filter", () => {
    const ranked = rankRatings(items, "movie", "desc");
    expect(ranked.map((r) => [r.title, r.rank])).toEqual([
      ["Arrival", 1],
      ["Dune", 2],
    ]);
  });

  it("does not mutate the input", () => {
    const copy = [...items];
    rankRatings(items, "all", "desc");
    expect(items).toEqual(copy);
  });

  it("returns an empty list when nothing matches", () => {
    expect(rankRatings([t("A", 3)], "anime", "desc")).toEqual([]);
  });
});
