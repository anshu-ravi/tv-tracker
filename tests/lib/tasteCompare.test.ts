import { describe, expect, it } from "vitest";
import { compareLibraries, matchLabel, MIN_SHARED_RATINGS } from "@/lib/tasteCompare";
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

const rated = (id: string, rating: number) => row(id, { rating: String(rating) });
const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

describe("compareLibraries: match score", () => {
  it("stays locked below the shared-rating threshold, however much else overlaps", () => {
    const shared = ids(MIN_SHARED_RATINGS - 1);
    const mine = [...shared.map((id) => rated(id, 4)), ...ids(50).map((id) => row(`w${id}`))];
    const theirs = [...shared.map((id) => rated(id, 4)), ...ids(50).map((id) => row(`w${id}`))];
    expect(compareLibraries(mine, theirs).match).toEqual({
      basis: "locked",
      sample: MIN_SHARED_RATINGS - 1,
      needed: MIN_SHARED_RATINGS,
    });
  });

  it("scores identical ratings as 100% once unlocked", () => {
    const shared = ids(MIN_SHARED_RATINGS);
    const c = compareLibraries(shared.map((id) => rated(id, 4)), shared.map((id) => rated(id, 4)));
    expect(c.match).toEqual({ basis: "ratings", percent: 100, sample: MIN_SHARED_RATINGS });
  });

  it("scores a maximum gap as 0%", () => {
    const shared = ids(MIN_SHARED_RATINGS);
    const c = compareLibraries(shared.map((id) => rated(id, 5)), shared.map((id) => rated(id, 0.5)));
    expect(c.match).toMatchObject({ basis: "ratings", percent: 0 });
  });

  it("labels both states", () => {
    expect(matchLabel({ basis: "ratings", percent: 87, sample: 23 })).toBe("87% match");
    expect(matchLabel({ basis: "locked", sample: 4, needed: 10 })).toBe("Match locked · 4/10");
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
});
