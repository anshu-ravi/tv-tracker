import { describe, expect, it } from "vitest";
import {
  RATING_MAX,
  RATING_MIN,
  quantizeRating,
  ratingFromRatio,
  stepRating,
} from "@/lib/ratingControl";

describe("quantizeRating", () => {
  it("snaps to the nearest 0.1", () => {
    expect(quantizeRating(4.24)).toBe(4.2);
    expect(quantizeRating(4.26)).toBe(4.3);
  });

  it("clamps below the minimum", () => {
    expect(quantizeRating(0)).toBe(RATING_MIN);
    expect(quantizeRating(-3)).toBe(RATING_MIN);
  });

  it("clamps above the maximum", () => {
    expect(quantizeRating(9)).toBe(RATING_MAX);
  });
});

describe("ratingFromRatio", () => {
  it("maps a position 82% along the track to the expected tenth", () => {
    expect(ratingFromRatio(0.82)).toBe(4.2);
  });

  it("clamps a ratio outside 0..1", () => {
    expect(ratingFromRatio(-0.5)).toBe(RATING_MIN);
    expect(ratingFromRatio(1.5)).toBe(RATING_MAX);
  });

  it("maps the ends of the track to the min and max", () => {
    expect(ratingFromRatio(0)).toBe(RATING_MIN);
    expect(ratingFromRatio(1)).toBe(RATING_MAX);
  });
});

describe("stepRating", () => {
  it("steps from 4.0 to 4.1 with no floating-point artefacts", () => {
    const stepped = stepRating(4.0, 1);
    expect(stepped).toBe(4.1);
    expect(String(stepped)).toBe("4.1");
  });

  it("repeated stepping never drifts off the 0.1 grid", () => {
    let value: number | null = 4.0;
    for (let i = 0; i < 5; i++) {
      value = stepRating(value, 1);
    }
    expect(value).toBe(4.5);
    expect(String(value)).toBe("4.5");
  });

  it("clamps at the maximum", () => {
    expect(stepRating(RATING_MAX, 1)).toBe(RATING_MAX);
  });

  it("clamps at the minimum", () => {
    expect(stepRating(RATING_MIN, -1)).toBe(RATING_MIN);
  });

  it("starts a null rating at the minimum in either direction", () => {
    expect(stepRating(null, 1)).toBe(RATING_MIN);
    expect(stepRating(null, -1)).toBe(RATING_MIN);
  });
});
