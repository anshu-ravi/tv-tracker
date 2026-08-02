import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../helpers/fetch";

// tmdb.ts reads TMDB_API_KEY at call time and throws if it's missing, so set
// it before each test rather than relying on import order.
beforeEach(() => {
  process.env.TMDB_API_KEY = "test-token";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  delete process.env.TMDB_API_KEY;
});

describe("searchTv", () => {
  it("returns [] without calling fetch for an empty query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { searchTv } = await import("@/lib/tmdb");

    const results = await searchTv("   ");

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps TMDB search results to SearchResult shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: 42,
            name: "Severance",
            first_air_date: "2022-02-18",
            poster_path: "/poster.jpg",
            overview: "An office drama.",
          },
          {
            id: 43,
            name: "No Date Show",
            first_air_date: null,
            poster_path: null,
            overview: null,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { searchTv } = await import("@/lib/tmdb");

    const results = await searchTv("severance");

    expect(results).toEqual([
      {
        source: "tmdb",
        sourceId: "42",
        mediaType: "tv",
        title: "Severance",
        year: 2022,
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        overview: "An office drama.",
      },
      {
        source: "tmdb",
        sourceId: "43",
        mediaType: "tv",
        title: "No Date Show",
        year: null,
        posterUrl: null,
        overview: null,
      },
    ]);

    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("/search/tv");
    expect(requestedUrl).toContain("query=severance");
  });

  it("throws when TMDB_API_KEY is not set", async () => {
    delete process.env.TMDB_API_KEY;
    vi.stubGlobal("fetch", vi.fn());
    const { searchTv } = await import("@/lib/tmdb");

    await expect(searchTv("severance")).rejects.toThrow(
      "TMDB_API_KEY is not set",
    );
  });
});

describe("getTvTitle", () => {
  const tvResponse = {
    id: 42,
    name: "Severance",
    original_name: "Severance",
    overview: "An office drama.",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    first_air_date: "2022-02-18",
    status: "Returning Series",
    number_of_episodes: 3,
    seasons: [
      { season_number: 0, episode_count: 2 }, // specials — should be skipped
      { season_number: 1, episode_number: 0, episode_count: 2 },
    ],
    next_episode_to_air: {
      air_date: "2026-08-05",
      season_number: 2,
      episode_number: 1,
    },
  };

  const season1Response = {
    episodes: [
      {
        season_number: 1,
        episode_number: 1,
        name: "Good News About Hell",
        overview: "Ep 1 overview",
        air_date: "2022-02-18",
        still_path: "/s1.jpg",
        runtime: 55,
      },
      {
        season_number: 1,
        episode_number: 2,
        name: "Half Loop",
        overview: null,
        air_date: "2022-02-18",
        still_path: null,
        runtime: 52,
      },
    ],
  };

  function stubFetch() {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/season/")) return jsonResponse(season1Response);
      return jsonResponse(tvResponse);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("builds a normalized title, skipping season 0", async () => {
    stubFetch();
    const { getTvTitle } = await import("@/lib/tmdb");

    const { title } = await getTvTitle("42");

    expect(title).toEqual({
      source: "tmdb",
      sourceId: "42",
      mediaType: "tv",
      title: "Severance",
      originalTitle: "Severance",
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w780/backdrop.jpg",
      overview: "An office drama.",
      firstAirDate: "2022-02-18",
      releaseStatus: "Returning Series",
      isRunning: true,
      totalEpisodes: 3,
      nextEpisodeAirDate: "2026-08-05",
      nextEpisodeLabel: "S2 E1",
    });
  });

  it("fetches episodes only for real seasons and maps their fields", async () => {
    stubFetch();
    const { getTvTitle } = await import("@/lib/tmdb");

    const { episodes } = await getTvTitle("42");

    expect(episodes).toEqual([
      {
        seasonNumber: 1,
        episodeNumber: 1,
        absoluteNumber: null,
        name: "Good News About Hell",
        overview: "Ep 1 overview",
        airDate: "2022-02-18",
        stillUrl: "https://image.tmdb.org/t/p/w300/s1.jpg",
        runtime: 55,
      },
      {
        seasonNumber: 1,
        episodeNumber: 2,
        absoluteNumber: null,
        name: "Half Loop",
        overview: null,
        airDate: "2022-02-18",
        stillUrl: null,
        runtime: 52,
      },
    ]);
  });

  it("marks isRunning false for ended shows", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/season/")) return jsonResponse({ episodes: [] });
      return jsonResponse({ ...tvResponse, status: "Ended", seasons: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getTvTitle } = await import("@/lib/tmdb");

    const { title } = await getTvTitle("42");

    expect(title.isRunning).toBe(false);
  });
});

describe("getTrending", () => {
  const trendingResponse = {
    results: [
      {
        id: 1,
        name: "Trending TV Show",
        first_air_date: "2020-01-01",
        poster_path: null,
        overview: null,
        genre_ids: [],
        origin_country: ["US"],
        original_language: "en",
      },
    ],
  };

  const discoverResponse = {
    results: [
      {
        id: 2,
        name: "Discover Anime Show",
        first_air_date: "2021-01-01",
        poster_path: null,
        overview: null,
        genre_ids: [16],
        origin_country: ["JP"],
        original_language: "ja",
      },
    ],
  };

  it("keeps the tv rail populated when the discover top-up fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/discover/tv")) {
        return { ok: false, status: 500 } as Response;
      }
      return jsonResponse(trendingResponse);
    });
    vi.stubGlobal("fetch", fetchMock);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getTrending } = await import("@/lib/tmdb");

    const { tv, anime } = await getTrending();

    expect(tv).toEqual([
      {
        source: "tmdb",
        sourceId: "1",
        mediaType: "tv",
        title: "Trending TV Show",
        year: 2020,
        posterUrl: null,
        overview: null,
      },
    ]);
    expect(anime).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("keeps the anime rail populated when the trending fetch fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/trending/tv/week")) {
        return { ok: false, status: 500 } as Response;
      }
      return jsonResponse(discoverResponse);
    });
    vi.stubGlobal("fetch", fetchMock);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { getTrending } = await import("@/lib/tmdb");

    const { tv, anime } = await getTrending();

    expect(tv).toEqual([]);
    expect(anime).toEqual([
      {
        source: "tmdb",
        sourceId: "2",
        mediaType: "anime",
        title: "Discover Anime Show",
        year: 2021,
        posterUrl: null,
        overview: null,
      },
    ]);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
