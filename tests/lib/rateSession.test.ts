import { describe, expect, it, vi } from "vitest";
import {
  adjustRating,
  applyBack,
  applyNext,
  applySkip,
  clearFailedRating,
  getSessionRating,
  recordFailedRating,
  saveWithRetry,
  setSessionRating,
  type RateStackState,
  type SessionRatings,
} from "@/lib/rateSession";

describe("session rating map", () => {
  it("returns null for a title never entered (skipped stays unrated)", () => {
    const ratings: SessionRatings = {};
    expect(getSessionRating(ratings, "t1")).toBeNull();
  });

  it("returns the value entered for a title", () => {
    const ratings = setSessionRating({}, "t1", 4.3);
    expect(getSessionRating(ratings, "t1")).toBe(4.3);
  });

  it("overwrites a previous value for the same title on revisit", () => {
    let ratings = setSessionRating({}, "t1", 3.5);
    ratings = setSessionRating(ratings, "t1", 4.7);
    expect(getSessionRating(ratings, "t1")).toBe(4.7);
  });

  it("does not affect other titles", () => {
    let ratings = setSessionRating({}, "t1", 3.5);
    ratings = setSessionRating(ratings, "t2", 2.0);
    expect(getSessionRating(ratings, "t1")).toBe(3.5);
    expect(getSessionRating(ratings, "t2")).toBe(2.0);
  });

  it("can record an explicit clear (null) distinct from never-visited", () => {
    let ratings = setSessionRating({}, "t1", 4.0);
    ratings = setSessionRating(ratings, "t1", null);
    expect(getSessionRating(ratings, "t1")).toBeNull();
  });
});

describe("stack transitions (NEXT saves + advances; adjusting never does)", () => {
  const initial: RateStackState = { index: 2, ratings: {} };

  it("adjusting a rating updates the draft but leaves the index untouched", () => {
    const next = adjustRating(initial, "t1", 4.3);
    expect(next.index).toBe(2);
    expect(getSessionRating(next.ratings, "t1")).toBe(4.3);
  });

  it("repeated adjustments (simulating -/+ presses) accumulate without advancing", () => {
    let state = adjustRating(initial, "t1", 0.5);
    state = adjustRating(state, "t1", 0.6);
    state = adjustRating(state, "t1", 0.7);
    expect(state.index).toBe(2);
    expect(getSessionRating(state.ratings, "t1")).toBe(0.7);
  });

  it("NEXT on a rated card saves that exact value and advances", () => {
    const rated = adjustRating(initial, "t1", 4.3);
    const { state, save } = applyNext(rated, "t1");
    expect(save).toBe(4.3);
    expect(state.index).toBe(3);
    // The draft rating is preserved, not cleared, on advance.
    expect(getSessionRating(state.ratings, "t1")).toBe(4.3);
  });

  it("NEXT on an unrated card is a no-op: nothing to save, index unchanged", () => {
    const { state, save } = applyNext(initial, "t1");
    expect(save).toBeNull();
    expect(state).toBe(initial);
  });

  it("Skip advances without saving, even when a draft value exists", () => {
    const rated = adjustRating(initial, "t1", 4.3);
    const next = applySkip(rated);
    expect(next.index).toBe(3);
    // Skip never triggers a save; the caller must not call saveRating.
    expect(getSessionRating(next.ratings, "t1")).toBe(4.3);
  });

  it("a title that was only skipped (never adjusted) stays unrated on revisit", () => {
    const next = applySkip(initial);
    expect(getSessionRating(next.ratings, "t1")).toBeNull();
  });

  it("Back rehydrates the previously entered value", () => {
    let state = adjustRating(initial, "t1", 3.5);
    state = applyNext(state, "t1").state;
    const back = applyBack(state);
    expect(back.index).toBe(2);
    expect(getSessionRating(back.ratings, "t1")).toBe(3.5);
  });

  it("Back never goes below the first card", () => {
    const start: RateStackState = { index: 0, ratings: {} };
    expect(applyBack(start).index).toBe(0);
  });
});

describe("failed rating tracking", () => {
  it("records a failure and clears it", () => {
    let failed = recordFailedRating({}, "t1", 4.0);
    expect(Object.keys(failed)).toEqual(["t1"]);
    failed = clearFailedRating(failed, "t1");
    expect(Object.keys(failed)).toEqual([]);
  });
});

describe("saveWithRetry", () => {
  it("succeeds without retrying when the first attempt succeeds", async () => {
    const attempt = vi.fn().mockResolvedValue(true);
    const ok = await saveWithRetry(attempt);
    expect(ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries once and succeeds on the second attempt", async () => {
    const attempt = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const ok = await saveWithRetry(attempt);
    expect(ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("is recorded as failed when it fails twice", async () => {
    const attempt = vi.fn().mockResolvedValue(false);
    const ok = await saveWithRetry(attempt);
    expect(ok).toBe(false);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("treats a thrown error the same as a failed attempt", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(true);
    const ok = await saveWithRetry(attempt);
    expect(ok).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
