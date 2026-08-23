import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import type { SearchResult } from "@/lib/types";

const { mockCreateClient, mockGetSimilarTv, mockGetSimilarMovie } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetSimilarTv: vi.fn(),
  mockGetSimilarMovie: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({
  getSimilarTv: mockGetSimilarTv,
  getSimilarMovie: mockGetSimilarMovie,
}));

const similarResult: SearchResult = {
  source: "tmdb",
  sourceId: "99",
  mediaType: "tv",
  title: "Similar Show",
  year: 2019,
  posterUrl: null,
  overview: null,
};

const libraryRows = [
  {
    status: "watching",
    titles: { id: "title-1", source: "tmdb", source_id: "99", media_type: "tv" },
  },
];

beforeEach(() => {
  mockCreateClient.mockResolvedValue(
    createFakeSupabase({
      user: { id: "user-1" },
      tableResults: { user_titles: { data: libraryRows, error: null } },
    }),
  );
  mockGetSimilarTv.mockResolvedValue([similarResult]);
  mockGetSimilarMovie.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

async function callSimilar(params: Record<string, string>) {
  const { GET } = await import("@/app/api/titles/similar/route");
  const search = new URLSearchParams(params);
  const request = new NextRequest(`http://localhost/api/titles/similar?${search}`);
  return GET(request);
}

describe("GET /api/titles/similar", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callSimilar({ source: "tmdb", sourceId: "42", mediaType: "tv" });

    expect(response.status).toBe(401);
  });

  it("returns 400 when source is not tmdb", async () => {
    const response = await callSimilar({ source: "anilist", sourceId: "42", mediaType: "tv" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when sourceId is missing", async () => {
    const response = await callSimilar({ source: "tmdb", mediaType: "tv" });

    expect(response.status).toBe(400);
  });

  it("returns 400 when mediaType is invalid", async () => {
    const response = await callSimilar({ source: "tmdb", sourceId: "42", mediaType: "book" });

    expect(response.status).toBe(400);
  });

  it("returns similar results plus a correctly keyed existing map on the happy path", async () => {
    const response = await callSimilar({ source: "tmdb", sourceId: "42", mediaType: "tv" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetSimilarTv).toHaveBeenCalledWith("42", false);
    expect(body.results).toEqual([similarResult]);
    expect(body.existing).toEqual({
      "tmdb:tv:99": { status: "watching", titleId: "title-1" },
    });
  });

  it("dispatches to getSimilarMovie for movies and getSimilarTv (seedIsAnime=true) for anime", async () => {
    await callSimilar({ source: "tmdb", sourceId: "42", mediaType: "movie" });
    expect(mockGetSimilarMovie).toHaveBeenCalledWith("42");
    expect(mockGetSimilarTv).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mockGetSimilarTv.mockResolvedValue([]);
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: { user_titles: { data: [], error: null } },
      }),
    );

    await callSimilar({ source: "tmdb", sourceId: "42", mediaType: "anime" });
    expect(mockGetSimilarTv).toHaveBeenCalledWith("42", true);
    expect(mockGetSimilarMovie).not.toHaveBeenCalled();
  });

  it("moves tracked titles to the end while preserving rank order within each group", async () => {
    const untrackedA: SearchResult = { ...similarResult, sourceId: "1", title: "Untracked A" };
    const trackedB: SearchResult = { ...similarResult, sourceId: "2", title: "Tracked B" };
    const untrackedC: SearchResult = { ...similarResult, sourceId: "3", title: "Untracked C" };
    const trackedD: SearchResult = { ...similarResult, sourceId: "4", title: "Tracked D" };
    mockGetSimilarTv.mockResolvedValue([untrackedA, trackedB, untrackedC, trackedD]);
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          user_titles: {
            data: [
              { status: "watching", titles: { id: "t2", source: "tmdb", source_id: "2", media_type: "tv" } },
              { status: "watchlist", titles: { id: "t4", source: "tmdb", source_id: "4", media_type: "tv" } },
            ],
            error: null,
          },
        },
      }),
    );

    const response = await callSimilar({ source: "tmdb", sourceId: "42", mediaType: "tv" });
    const body = await response.json();

    expect(body.results.map((r: SearchResult) => r.sourceId)).toEqual(["1", "3", "2", "4"]);
  });

  it("filters out the seed title if TMDB includes it in its own recommendations", async () => {
    mockGetSimilarTv.mockResolvedValue([similarResult, { ...similarResult, sourceId: "42" }]);

    const response = await callSimilar({ source: "tmdb", sourceId: "42", mediaType: "tv" });
    const body = await response.json();

    expect(body.results).toEqual([similarResult]);
  });

  it("degrades to empty results with 200 when TMDB throws", async () => {
    mockGetSimilarTv.mockRejectedValue(new Error("TMDB is down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await callSimilar({ source: "tmdb", sourceId: "42", mediaType: "tv" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([]);
    consoleErrorSpy.mockRestore();
  });
});
