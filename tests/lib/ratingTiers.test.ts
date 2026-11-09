import { describe, expect, it } from "vitest";
import { groupByTier, tierFor } from "@/lib/ratingTiers";

describe("tierFor", () => {
  it("places ratings on band boundaries in the higher band", () => {
    expect(tierFor(5).key).toBe("must");
    expect(tierFor(4.5).key).toBe("must");
    expect(tierFor(4.4).key).toBe("great");
    expect(tierFor(4.0).key).toBe("great");
    expect(tierFor(3.9).key).toBe("good");
    expect(tierFor(3.5).key).toBe("good");
    expect(tierFor(3.0).key).toBe("meh");
    expect(tierFor(2.9).key).toBe("skip");
    expect(tierFor(0.5).key).toBe("skip");
  });

  it("tolerates float error near a boundary", () => {
    expect(tierFor(4.499999999).key).toBe("must");
  });
});

describe("groupByTier", () => {
  const r = (rating: number) => ({ rating });

  it("groups consecutive items by tier, preserving order", () => {
    const groups = groupByTier([r(4.6), r(4.5), r(4.2), r(3.1), r(2.0)]);
    expect(groups.map((g) => [g.tier.key, g.items.length])).toEqual([
      ["must", 2],
      ["great", 1],
      ["meh", 1],
      ["skip", 1],
    ]);
  });

  it("works for ascending order too", () => {
    const groups = groupByTier([r(2.0), r(2.5), r(4.0)]);
    expect(groups.map((g) => g.tier.key)).toEqual(["skip", "great"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupByTier([])).toEqual([]);
  });
});
