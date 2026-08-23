import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import type { SearchResult } from "@/lib/types";

const { mockCreateClient, mockSearchTv, mockSearchMovie } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockSearchTv: vi.fn(),
  mockSearchMovie: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({
  searchTv: mockSearchTv,
  searchMovie: mockSearchMovie,
}));

const tvResult: SearchResult = {
  source: "tmdb",
  sourceId: "1",
  mediaType: "tv",
  title: "TV Show",
  year: 2020,
  posterUrl: null,
  overview: null,
};

// searchTv() itself classifies each raw TMDB result as "tv" or "anime" (see
// classifyTmdbSearchResult in lib/tmdb.ts) before the route ever sees it —
// AniList has been fully retired, so the route's job is to call searchTv +
// searchMovie in parallel, merge them, and swallow either provider's error.
const animeResult: SearchResult = {
  source: "tmdb",
  sourceId: "2",
  mediaType: "anime",
  title: "Anime Show",
  year: 2021,
  posterUrl: null,
  overview: null,
};

const movieResult: SearchResult = {
  source: "tmdb",
  sourceId: "3",
  mediaType: "movie",
  title: "A Movie",
  year: 2010,
  posterUrl: null,
  overview: null,
};

beforeEach(() => {
  mockCreateClient.mockResolvedValue(
    createFakeSupabase({ user: { id: "user-1" } }),
  );
  mockSearchTv.mockResolvedValue([tvResult, animeResult]);
  mockSearchMovie.mockResolvedValue([movieResult]);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function callSearch(query: string) {
  const { GET } = await import("@/app/api/search/route");
  const request = new NextRequest(
    `http://localhost/api/search?q=${encodeURIComponent(query)}`,
  );
  return GET(request);
}

describe("GET /api/search", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callSearch("foo");

    expect(response.status).toBe(401);
  });

  it("returns [] for a blank query without calling TMDB", async () => {
    const response = await callSearch("   ");
    const body = await response.json();

    expect(body).toEqual({ results: [] });
    expect(mockSearchTv).not.toHaveBeenCalled();
    expect(mockSearchMovie).not.toHaveBeenCalled();
  });

  it("returns [] for an empty query without calling TMDB", async () => {
    const response = await callSearch("");
    const body = await response.json();

    expect(body).toEqual({ results: [] });
    expect(mockSearchTv).not.toHaveBeenCalled();
    expect(mockSearchMovie).not.toHaveBeenCalled();
  });

  it("queries both tv and movie search in parallel and includes movies in the results", async () => {
    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSearchTv).toHaveBeenCalledWith("show");
    expect(mockSearchMovie).toHaveBeenCalledWith("show");
    // A regression that dropped searchMovie's results (or stopped calling
    // it) would leave the movie result out of this array — assert on
    // membership, not just array length, so that failure mode is caught.
    expect(body.results).toContainEqual(movieResult);
    expect(body.results).toHaveLength(3);
  });

  it("interleaves movie results with tv/anime results instead of appending them at the end", async () => {
    // Three tv/anime hits outrank the single movie hit inside searchTv's own
    // list, but the movie should still surface early in the merged order
    // (round-robin), not get pushed behind all three tv/anime results.
    const secondTv: SearchResult = { ...tvResult, sourceId: "4", title: "Second TV" };
    const thirdTv: SearchResult = { ...tvResult, sourceId: "5", title: "Third TV" };
    mockSearchTv.mockResolvedValue([tvResult, secondTv, thirdTv]);

    const response = await callSearch("inception");
    const body = await response.json();

    const movieIndex = body.results.findIndex(
      (r: SearchResult) => r.sourceId === movieResult.sourceId,
    );
    // Round-robin puts the movie at index 1 (after the first tv result) —
    // a plain concatenation would instead put it at index 3, the end.
    expect(movieIndex).toBe(1);
  });

  it("trims surrounding whitespace before querying TMDB", async () => {
    await callSearch("  show  ");

    expect(mockSearchTv).toHaveBeenCalledWith("show");
    expect(mockSearchMovie).toHaveBeenCalledWith("show");
  });

  it("still returns movie results when the tv/anime search fails", async () => {
    mockSearchTv.mockRejectedValue(new Error("TMDB tv search is down"));

    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([movieResult]);
  });

  it("still returns tv/anime results when the movie search fails", async () => {
    mockSearchMovie.mockRejectedValue(new Error("TMDB movie search is down"));

    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([tvResult, animeResult]);
  });

  it("returns 200 with an empty results array when both providers throw", async () => {
    mockSearchTv.mockRejectedValue(new Error("TMDB tv search is down"));
    mockSearchMovie.mockRejectedValue(new Error("TMDB movie search is down"));

    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
  });
});
