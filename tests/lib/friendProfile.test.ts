import { describe, expect, it } from "vitest";
import {
  filterByMedia,
  groupByStatus,
  groupLists,
  parseMediaFilter,
  parseTab,
  profileCounts,
  progressLabel,
  toCard,
  topRated,
  type FriendLibraryRow,
  type FriendListRow,
} from "@/lib/friendProfile";

function row(overrides: Partial<FriendLibraryRow>): FriendLibraryRow {
  return {
    title_id: "t",
    title: "Title",
    poster_url: null,
    media_type: "tv",
    source: "tmdb",
    source_id: "1",
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

describe("parseTab / parseMediaFilter", () => {
  it("fall back to defaults for unknown values", () => {
    expect(parseTab("library")).toBe("library");
    expect(parseTab("compare")).toBe("compare");
    expect(parseTab("stats")).toBe("top");
    expect(parseMediaFilter("movie")).toBe("movie");
    expect(parseMediaFilter(undefined)).toBe("all");
  });
});

describe("progressLabel", () => {
  it("shows the last watched episode and count", () => {
    expect(
      progressLabel(row({ status: "watching", watched_count: 22, aired_count: 26, last_season: 2, last_episode: 4 })),
    ).toBe("S2E4 · 22/26");
  });

  it("is null for movies and for nothing watched", () => {
    expect(progressLabel(row({ media_type: "movie", watched_count: 1 }))).toBeNull();
    expect(progressLabel(row({ watched_count: 0 }))).toBeNull();
  });

  it("only appears on cards for titles being watched", () => {
    const base = { watched_count: 3, aired_count: 10, last_season: 1, last_episode: 3 };
    expect(toCard(row({ ...base, status: "watching" })).progress).toBe("S1E3 · 3/10");
    expect(toCard(row({ ...base, status: "dnf" })).progress).toBeNull();
  });
});

describe("topRated", () => {
  it("drops unrated titles, parses numeric strings, and sorts high to low", () => {
    const rows = [
      row({ title_id: "a", rating: "3.5" }),
      row({ title_id: "b", rating: null }),
      row({ title_id: "c", rating: "5.0" }),
      row({ title_id: "d", rating: 3.5, updated_at: "2026-06-01T00:00:00Z" }),
    ];
    expect(topRated(rows).map((r) => r.title_id)).toEqual(["c", "d", "a"]);
    expect(toCard(rows[2]).rating).toBe(5);
  });
});

describe("groupByStatus / filterByMedia / profileCounts", () => {
  const rows = [
    row({ title_id: "a", status: "watching", media_type: "anime" }),
    row({ title_id: "b", status: "completed", rating: 4 }),
    row({ title_id: "c", status: "completed", media_type: "movie" }),
    row({ title_id: "d", status: "dnf" }),
  ];

  it("buckets by status", () => {
    const g = groupByStatus(rows);
    expect(g.watching.map((r) => r.title_id)).toEqual(["a"]);
    expect(g.completed).toHaveLength(2);
    expect(g.watchlist).toHaveLength(0);
  });

  it("filters by media type", () => {
    expect(filterByMedia(rows, "movie").map((r) => r.title_id)).toEqual(["c"]);
    expect(filterByMedia(rows, "all")).toHaveLength(4);
  });

  it("counts completed, watching and rated", () => {
    expect(profileCounts(rows)).toEqual({ completed: 2, watching: 1, rated: 1 });
  });
});

describe("groupLists", () => {
  const listRow = (overrides: Partial<FriendListRow>): FriendListRow => ({
    list_id: "l1",
    list_name: "Favorites",
    is_favorites: true,
    title_id: "t1",
    title: "One",
    poster_url: null,
    media_type: "tv",
    source: "tmdb",
    source_id: "1",
    ...overrides,
  });

  it("folds rows into lists in order and keeps empty lists", () => {
    const lists = groupLists([
      listRow({}),
      listRow({ title_id: "t2", title: "Two", media_type: "movie" }),
      listRow({ list_id: "l2", list_name: "Empty", is_favorites: false, title_id: null, title: null, media_type: null, source: null, source_id: null }),
    ]);
    expect(lists.map((l) => [l.name, l.titles.length])).toEqual([
      ["Favorites", 2],
      ["Empty", 0],
    ]);
  });

  it("applies the media filter to list contents", () => {
    const lists = groupLists([listRow({}), listRow({ title_id: "t2", media_type: "movie" })], "movie");
    expect(lists[0].titles.map((t) => t.id)).toEqual(["t2"]);
  });
});
