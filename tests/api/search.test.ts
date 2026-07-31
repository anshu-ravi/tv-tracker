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

  it("merges TMDB and AniList results, AniList first", async () => {
    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([animeResult, tvResult]);
  });

  it("still returns 200 with the other provider's results if one rejects", async () => {
    mockSearchTv.mockRejectedValue(new Error("TMDB is down"));

    const response = await callSearch("show");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([animeResult]);
  });

  it("drops the TMDB duplicate when the same title exists on AniList, keeping AniList first", async () => {
    const tvDuplicate: SearchResult = {
      source: "tmdb",
      sourceId: "10",
      mediaType: "tv",
      title: "Attack on Titan!",
      year: 2013,
      posterUrl: null,
      overview: null,
    };
    const animeMatch: SearchResult = {
      source: "anilist",
      sourceId: "20",
      mediaType: "anime",
      title: "attack on   titan",
      year: 2013,
      posterUrl: null,
      overview: null,
    };
    mockSearchTv.mockResolvedValue([tvResult, tvDuplicate]);
    mockSearchAnime.mockResolvedValue([animeMatch]);

    const response = await callSearch("attack on titan");
    const body = await response.json();

    expect(response.status).toBe(200);
    // animeMatch first (preferred), then the surviving tv result — the
    // near-duplicate tv title is gone entirely.
    expect(body.results).toEqual([animeMatch, tvResult]);
  });

  it("does not dedupe titles that merely look similar (no exact normalized match)", async () => {
    const tvSimilar: SearchResult = {
      source: "tmdb",
      sourceId: "11",
      mediaType: "tv",
      title: "Attack on Titan: Junior High",
      year: 2015,
      posterUrl: null,
      overview: null,
    };
    const animeMatch: SearchResult = {
      source: "anilist",
      sourceId: "21",
      mediaType: "anime",
      title: "Attack on Titan",
      year: 2013,
      posterUrl: null,
      overview: null,
    };
    mockSearchTv.mockResolvedValue([tvSimilar]);
    mockSearchAnime.mockResolvedValue([animeMatch]);

    const response = await callSearch("attack on titan");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([animeMatch, tvSimilar]);
  });
});
