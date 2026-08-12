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

describe("searchMovie", () => {
  it("returns [] without calling fetch for an empty query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { searchMovie } = await import("@/lib/tmdb");

    const results = await searchMovie("   ");

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps TMDB movie search results (title/release_date, not name/first_air_date) to SearchResult shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: 27205,
            title: "Inception",
            release_date: "2010-07-15",
            poster_path: "/poster.jpg",
            overview: "A thief who steals corporate secrets.",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { searchMovie } = await import("@/lib/tmdb");

    const results = await searchMovie("inception");

    expect(results).toEqual([
      {
        source: "tmdb",
        sourceId: "27205",
        mediaType: "movie",
        title: "Inception",
        year: 2010,
        posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
        overview: "A thief who steals corporate secrets.",
      },
    ]);

    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("/search/movie");
  });
});

describe("getMovieTitle", () => {
  const movieResponse = {
    id: 27205,
    title: "Inception",
    original_title: "Inception",
    overview: "A thief who steals corporate secrets.",
    poster_path: "/poster.jpg",
    backdrop_path: "/backdrop.jpg",
    release_date: "2010-07-15",
    runtime: 148,
    status: "Released",
  };

  it("normalizes TMDB's movie field names (title/release_date/runtime, no seasons) onto NormalizedTitle", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(movieResponse)));
    const { getMovieTitle } = await import("@/lib/tmdb");

    const { title } = await getMovieTitle("27205");

    expect(title).toEqual({
      source: "tmdb",
      sourceId: "27205",
      mediaType: "movie",
      title: "Inception",
      originalTitle: "Inception",
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w780/backdrop.jpg",
      overview: "A thief who steals corporate secrets.",
      firstAirDate: "2010-07-15",
      releaseStatus: "Released",
      isRunning: false,
      totalEpisodes: null,
      nextEpisodeAirDate: null,
      nextEpisodeLabel: null,
    });
  });

  it("maps the movie's release date and top-level runtime onto a single NormalizedMovieEpisode, never a season/episode number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(movieResponse)));
    const { getMovieTitle } = await import("@/lib/tmdb");

    const { episode } = await getMovieTitle("27205");

    expect(episode).toEqual({
      name: "Inception",
      overview: "A thief who steals corporate secrets.",
      airDate: "2010-07-15",
      stillUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      runtime: 148,
    });
    expect(episode).not.toHaveProperty("seasonNumber");
    expect(episode).not.toHaveProperty("episodeNumber");
  });

  it("is never marked isRunning, regardless of TMDB movie status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ...movieResponse, status: "In Production" })),
    );
    const { getMovieTitle } = await import("@/lib/tmdb");

    const { title } = await getMovieTitle("27205");

    expect(title.isRunning).toBe(false);
  });
});

describe("getMovieCredits", () => {
  it("pulls directors from credits.crew (job === Director), not created_by", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: 27205,
          title: "Inception",
          credits: {
            crew: [
              { name: "Christopher Nolan", job: "Director" },
              { name: "Emma Thomas", job: "Producer" },
            ],
            cast: [
              { name: "Leonardo DiCaprio", character: "Cobb", profile_path: "/dicaprio.jpg", order: 0 },
            ],
          },
        }),
      ),
    );
    const { getMovieCredits } = await import("@/lib/tmdb");

    const credits = await getMovieCredits("27205");

    expect(credits.creators).toEqual(["Christopher Nolan"]);
    expect(credits.cast).toEqual([
      { name: "Leonardo DiCaprio", role: "Cobb", imageUrl: "https://image.tmdb.org/t/p/w185/dicaprio.jpg" },
    ]);
  });
});

describe("getMovieImdbId", () => {
  it("hits /movie/{id}/external_ids and returns imdb_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ imdb_id: "tt1375666" }));
    vi.stubGlobal("fetch", fetchMock);
    const { getMovieImdbId } = await import("@/lib/tmdb");

    const imdbId = await getMovieImdbId("27205");

    expect(imdbId).toBe("tt1375666");
    const requestedUrl = String(fetchMock.mock.calls[0][0]);
    expect(requestedUrl).toContain("/movie/27205/external_ids");
  });

  it("returns null when TMDB has no imdb_id for the movie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ imdb_id: null })));
    const { getMovieImdbId } = await import("@/lib/tmdb");

    expect(await getMovieImdbId("27205")).toBeNull();
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
