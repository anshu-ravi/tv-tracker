import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import type { SearchResult } from "@/lib/types";

const { mockCreateClient, mockSearchTv } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockSearchTv: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({ searchTv: mockSearchTv }));

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
// AniList has been fully retired, so the route's only job is to call
// searchTv, handle empty queries, and swallow provider errors.
const animeResult: SearchResult = {
  source: "tmdb",
  sourceId: "2",
  mediaType: "anime",
  title: "Anime Show",
  year: 2021,
  posterUrl: null,
  overview: null,
};

beforeEach(() => {
  mockCreateClient.mockResolvedValue(
    createFakeSupabase({ user: { id: "user-1" } }),
  );
  mockSearchTv.mockResolvedValue([tvResult, animeResult]);
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
  });

  it("returns [] for an empty query without calling TMDB", async () => {
    const response = await callSearch("");
    const body = await response.json();

    expect(body).toEqual({ results: [] });
    expect(mockSearchTv).not.toHaveBeenCalled();
  });

  it("returns TMDB's results as-is, tv and anime mixed together", async () => {
    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSearchTv).toHaveBeenCalledWith("show");
    // The route trusts searchTv's classification and ordering — it does not
    // reorder, dedupe, or otherwise post-process the results.
    expect(body.results).toEqual([tvResult, animeResult]);
  });

  it("trims surrounding whitespace before querying TMDB", async () => {
    await callSearch("  show  ");

    expect(mockSearchTv).toHaveBeenCalledWith("show");
  });

  it("returns 200 with an empty results array when TMDB throws", async () => {
    mockSearchTv.mockRejectedValue(new Error("TMDB is down"));

    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
  });
});
