import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import type { SearchResult } from "@/lib/types";

const { mockCreateClient, mockGetTrending } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetTrending: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({ getTrending: mockGetTrending }));

const tvResult: SearchResult = {
  source: "tmdb",
  sourceId: "1",
  mediaType: "tv",
  title: "TV Show",
  year: 2020,
  posterUrl: null,
  overview: null,
};

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
  mockGetTrending.mockResolvedValue({ tv: [tvResult], anime: [animeResult] });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function callExplore() {
  const { GET } = await import("@/app/api/search/explore/route");
  return GET();
}

describe("GET /api/search/explore", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callExplore();

    expect(response.status).toBe(401);
  });

  it("returns both rails as given by getTrending", async () => {
    const response = await callExplore();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetTrending).toHaveBeenCalled();
    expect(body).toEqual({ tv: [tvResult], anime: [animeResult] });
  });

  it("returns 200 with empty rails when TMDB throws", async () => {
    mockGetTrending.mockRejectedValue(new Error("TMDB is down"));

    const response = await callExplore();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ tv: [], anime: [] });
  });

  it("still returns the tv rail when only the anime top-up fails", async () => {
    // getTrending() itself degrades independently: a failure in the
    // discover-tv top-up must not zero out a perfectly good trending-tv
    // rail. Simulated here by having the mock resolve with a populated tv
    // rail and an empty anime rail, matching what getTrending() would
    // return in that scenario.
    mockGetTrending.mockResolvedValue({ tv: [tvResult], anime: [] });

    const response = await callExplore();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ tv: [tvResult], anime: [] });
  });

  it("still returns the anime rail when only trending fails", async () => {
    mockGetTrending.mockResolvedValue({ tv: [], anime: [animeResult] });

    const response = await callExplore();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ tv: [], anime: [animeResult] });
  });
});
