import { describe, expect, it } from "vitest";
import { compareLibraries, matchBasis, matchLabel } from "@/lib/tasteCompare";
import type { FriendLibraryRow } from "@/lib/friendProfile";

function row(id: string, overrides: Partial<FriendLibraryRow> = {}): FriendLibraryRow {
  return {
    title_id: id,
    title: id,
    poster_url: null,
    media_type: "tv",
    source: "tmdb",
    source_id: id,
    is_running: false,
    status: "completed",
    rating: null,
    updated_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    watched_count: 0,
    aired_count: 0,
    last_season: null,
    last_episode: null,
    ...overrides,
  };
}

const rated = (id: string, rating: number, overrides: Partial<FriendLibraryRow> = {}) =>
  row(id, { rating: String(rating), ...overrides });

describe("compareLibraries: match score", () => {
  it("scores identical ratings as 100% once there are enough shared ratings", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const c = compareLibraries(ids.map((id) => rated(id, 4)), ids.map((id) => rated(id, 4)));
    expect(c.match).toEqual({ basis: "ratings", percent: 100, sample: 5 });
  });

  it("scores a maximum gap as 0%", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const c = compareLibraries(ids.map((id) => rated(id, 5)), ids.map((id) => rated(id, 0.5)));
    expect(c.match).toMatchObject({ basis: "ratings", percent: 0 });
  });

  it("falls back to shared watching below the rating threshold", () => {
    const mine = [rated("a", 4), row("b"), row("c", { status: "dnf" }), row("d", { status: "watchlist" })];
    const theirs = [rated("a", 4), row("b"), row("c"), row("d")];
    const c = compareLibraries(mine, theirs);
    // a and b agree (1, 1), c conflicts (0); d is watchlist and ignored
    expect(c.match).toEqual({ basis: "watching", percent: 67, sample: 3 });
  });

  it("reports no score when there is too little overlap", () => {
    const c = compareLibraries([row("a")], [row("a"), row("b")]);
    expect(c.match).toEqual({ basis: "none", sample: 1 });
    expect(matchLabel(c.match)).toBe("Not enough overlap yet");
    expect(matchBasis(c.match)).toBe("Only 1 in common so far");
  });
});

describe("compareLibraries: lists", () => {
  const mine = [rated("agree", 4.5), rated("clash", 5), rated("mid", 3), rated("mine-only", 4.5), rated("meh-mine", 3)];
  const theirs = [rated("agree", 4), rated("clash", 2), rated("mid", 4), rated("theirs-only", 4.5), rated("meh", 3)];
  const c = compareLibraries(mine, theirs);

  it("splits shared ratings into agree and disagree", () => {
    expect(c.agree.map((p) => p.title.id)).toEqual(["agree"]);
    expect(c.disagree.map((p) => [p.title.id, p.mine, p.theirs])).toEqual([["clash", 5, 2]]);
  });

  it("finds titles one person loved that the other hasn't tracked", () => {
    expect(c.theyLoved.map((t) => t.id)).toEqual(["theirs-only"]);
    expect(c.youLoved.map((t) => t.id)).toEqual(["mine-only"]);
  });

  it("formats the header label", () => {
    expect(matchLabel({ basis: "ratings", percent: 87, sample: 23 })).toBe("87% match");
    expect(matchBasis({ basis: "ratings", percent: 87, sample: 23 })).toBe("23 shared ratings");
  });
});
