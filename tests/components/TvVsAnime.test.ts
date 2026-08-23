import { describe, expect, it } from "vitest";
import { roundSharesToSum100 } from "@/components/stats/TvVsAnime";

// Largest-remainder rounding for the N-segment stats bar (TV/Anime/Movies).
// Must always sum to exactly 100, even when plain independent rounding
// would miss or overshoot near a boundary.
describe("roundSharesToSum100", () => {
  it("splits an even three-way share without drift", () => {
    const pcts = roundSharesToSum100([1 / 3, 1 / 3, 1 / 3]);
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(pcts).toEqual([34, 33, 33]);
  });

  it("gives the leftover point to the largest fractional remainder", () => {
    // 65.4 / 34.6 floors to 65/34 = 99, one point left over -> goes to the
    // larger remainder (0.6 > 0.4).
    const pcts = roundSharesToSum100([0.654, 0.346]);
    expect(pcts).toEqual([65, 35]);
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("handles a zero share without upsetting the sum", () => {
    const pcts = roundSharesToSum100([0.7, 0.3, 0]);
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(pcts[2]).toBe(0);
  });

  it("returns all zeros for an all-zero input", () => {
    expect(roundSharesToSum100([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("sums to 100 across many N-way splits (no drift)", () => {
    const cases: number[][] = [
      [0.5, 0.5],
      [0.1, 0.2, 0.3, 0.4],
      [0.6667, 0.3333],
      [0.9999, 0.0001],
      [0.2, 0.2, 0.2, 0.2, 0.2],
    ];
    for (const shares of cases) {
      const pcts = roundSharesToSum100(shares);
      expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});
