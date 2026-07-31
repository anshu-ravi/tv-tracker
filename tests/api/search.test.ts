import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import type { SearchResult } from "@/lib/types";

const { mockCreateClient, mockSearchTv, mockSearchAnime } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockSearchTv: vi.fn(),
  mockSearchAnime: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({ searchTv: mockSearchTv }));
vi.mock("@/lib/anilist", () => ({ searchAnime: mockSearchAnime }));

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
  source: "anilist",
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
  mockSearchTv.mockResolvedValue([tvResult]);
  mockSearchAnime.mockResolvedValue([animeResult]);
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

  it("returns [] for a blank query without calling either provider", async () => {
    const response = await callSearch("   ");
    const body = await response.json();

    expect(body).toEqual({ results: [] });
    expect(mockSearchTv).not.toHaveBeenCalled();
    expect(mockSearchAnime).not.toHaveBeenCalled();
  });

  it("merges TMDB and AniList results", async () => {
    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([tvResult, animeResult]);
  });

  it("still returns 200 with the other provider's results if one rejects", async () => {
    mockSearchTv.mockRejectedValue(new Error("TMDB is down"));

    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([animeResult]);
  });
});
