import { describe, expect, it } from "vitest";
import {
  friendStatusLabel,
  friendsSummary,
  lovedNote,
  toLovedResult,
  type FriendOnTitleRow,
  type FriendsLovedRow,
} from "@/lib/friendsContext";

const onTitle = (overrides: Partial<FriendOnTitleRow>): FriendOnTitleRow => ({
  user_id: "u",
  handle: "fago",
  display_name: "Fagotinho",
  avatar_url: null,
  status: "completed",
  rating: null,
  watched_count: 0,
  ...overrides,
});

const loved = (overrides: Partial<FriendsLovedRow>): FriendsLovedRow => ({
  title_id: "t",
  title: "Dark",
  poster_url: "/p.jpg",
  media_type: "tv",
  source: "tmdb",
  source_id: "70523",
  first_air_date: "2017-12-01",
  best_rating: "4.5",
  friend_count: 1,
  friend_names: ["Andres"],
  ...overrides,
});

describe("friendStatusLabel", () => {
  it("adds the episode count for shows", () => {
    expect(friendStatusLabel(onTitle({ watched_count: 73 }), false)).toBe("Completed · 73 eps");
    expect(friendStatusLabel(onTitle({ status: "watching", watched_count: 1 }), false)).toBe("Watching · 1 ep");
  });

  it("omits counts for movies, watchlist entries and nothing watched", () => {
    expect(friendStatusLabel(onTitle({ watched_count: 1 }), true)).toBe("Completed");
    expect(friendStatusLabel(onTitle({ status: "watchlist", watched_count: 3 }), false)).toBe("Watchlist");
    expect(friendStatusLabel(onTitle({ status: "dnf" }), false)).toBe("Dropped");
  });
});

describe("lovedNote", () => {
  it("names up to two friends with the best rating", () => {
    expect(lovedNote(loved({}))).toBe("Andres ★ 4.5");
    expect(lovedNote(loved({ friend_names: ["Andres", "Ravi"] }))).toBe("Andres & Ravi ★ 4.5");
    expect(lovedNote(loved({ friend_names: ["A", "B", "C"] }))).toBe("A +2 ★ 4.5");
  });

  it("marks an unrated favorite with a heart", () => {
    expect(lovedNote(loved({ best_rating: null }))).toBe("♥ Andres");
  });
});

describe("toLovedResult", () => {
  it("maps to a search result with year and note", () => {
    expect(toLovedResult(loved({}))).toEqual({
      source: "tmdb",
      sourceId: "70523",
      mediaType: "tv",
      title: "Dark",
      year: 2017,
      posterUrl: "/p.jpg",
      note: "Andres ★ 4.5",
    });
  });
});

describe("friendsSummary", () => {
  it("names a single friend with their status and own rating", () => {
    const summary = friendsSummary([onTitle({ status: "watching", watched_count: 3, rating: "4.5" })], false);
    expect(summary).toEqual({ text: "Fagotinho · Watching · 3 eps", rating: 4.5 });
  });

  it("counts several friends and averages only the rated ones", () => {
    const rows = [
      onTitle({ user_id: "a", rating: 4 }),
      onTitle({ user_id: "b", rating: "3.5" }),
      onTitle({ user_id: "c", rating: null }),
    ];
    expect(friendsSummary(rows, false)).toEqual({ text: "3 friends", rating: 3.8 });
  });

  it("returns a null rating when nobody rated", () => {
    expect(friendsSummary([onTitle({ rating: null }), onTitle({ user_id: "b", rating: null })], true).rating).toBeNull();
  });
});
