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

describe("getSimilarTv", () => {
  function tvResult(
    id: number,
    overrides: Partial<{
      poster_path: string | null;
      genre_ids: number[];
      origin_country: string[];
      original_language: string;
      vote_count: number;
      vote_average: number;
      popularity: number;
    }> = {},
  ) {
    return {
      id,
      name: `Show ${id}`,
      first_air_date: "2020-01-01",
      poster_path: overrides.poster_path === undefined ? "/poster.jpg" : overrides.poster_path,
      overview: null,
      genre_ids: overrides.genre_ids ?? [],
      origin_country: overrides.origin_country ?? ["US"],
      original_language: overrides.original_language ?? "en",
      vote_count: overrides.vote_count ?? 0,
      vote_average: overrides.vote_average ?? 0,
      popularity: overrides.popularity ?? 0,
    };
  }

  // Only page 1 carries results by default; pages 2/3 and a /similar
  // fallback all resolve empty so tests that don't care about pagination or
  // the /similar top-up stay simple.
  function stubRecommendationPages(page1Results: ReturnType<typeof tvResult>[]) {
    return vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/recommendations") && url.includes("page=1")) {
        return jsonResponse({ results: page1Results });
      }
      return jsonResponse({ results: [] });
    });
  }

  it("maps a recommendations response to SearchResult shape", async () => {
    const fetchMock = stubRecommendationPages(
      Array.from({ length: 6 }, (_, i) => tvResult(i + 1)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");

    expect(results[0]).toEqual({
      source: "tmdb",
      sourceId: "1",
      mediaType: "tv",
      title: "Show 1",
      year: 2020,
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      overview: null,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/tv/42/recommendations");
  });

  it("fetches 3 recommendation pages and merges them; a failing page degrades gracefully instead of throwing", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("page=1")) {
        return jsonResponse({ results: [tvResult(1), tvResult(2), tvResult(3)] });
      }
      if (url.includes("page=2")) return { ok: false, status: 500 } as Response;
      if (url.includes("page=3")) {
        return jsonResponse({ results: [tvResult(4), tvResult(5), tvResult(6)] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(results.map((r) => r.sourceId)).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  it("ranks by score, not TMDB's page order — a low-vote item placed first ends up below a high-vote item placed last", async () => {
    const low = tvResult(1, { vote_count: 5, vote_average: 3, popularity: 1 });
    const filler = [2, 3, 4, 5].map((id) => tvResult(id, { vote_count: 30 }));
    const high = tvResult(6, { vote_count: 5000, vote_average: 9, popularity: 500 });
    const fetchMock = stubRecommendationPages([low, ...filler, high]);
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");
    const ids = results.map((r) => r.sourceId);

    expect(ids.indexOf("6")).toBeLessThan(ids.indexOf("1"));
  });

  it("does not call /similar when recommendations already return >= 6 usable results", async () => {
    const fetchMock = stubRecommendationPages(
      Array.from({ length: 6 }, (_, i) => tvResult(i + 1, { vote_count: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    await getSimilarTv("42");

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("/similar");
    }
  });

  it("applies the vote-count floor: high-vote results survive, low-vote junk is dropped", async () => {
    const good = Array.from({ length: 6 }, (_, i) => tvResult(i + 1, { vote_count: 200 }));
    const junk = Array.from({ length: 3 }, (_, i) => tvResult(100 + i, { vote_count: 5 }));
    const fetchMock = stubRecommendationPages([...good, ...junk]);
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");

    expect(results.map((r) => r.sourceId).sort()).toEqual(
      good.map((r) => String(r.id)).sort(),
    );
  });

  it("relaxes the vote floor to 0 when nothing clears 150 or 50 votes, instead of returning an empty rail", async () => {
    const belowFloor = Array.from({ length: 8 }, (_, i) => tvResult(i + 1, { vote_count: 30 }));
    const fetchMock = stubRecommendationPages(belowFloor);
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");

    expect(results).toHaveLength(8);
  });

  it("tops up from /similar and dedupes by id (recommendations win) when recommendations are thin", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/recommendations") && url.includes("page=1")) {
        return jsonResponse({ results: [tvResult(1), tvResult(2)] });
      }
      if (url.includes("/recommendations")) return jsonResponse({ results: [] });
      if (url.includes("/similar")) {
        // id 1 overlaps with recommendations and must not be duplicated.
        return jsonResponse({ results: [tvResult(1), tvResult(3)] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");

    expect(results.map((r) => r.sourceId).sort()).toEqual(["1", "2", "3"]);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/similar"))).toBe(true);
  });

  it("drops a non-anime /similar result when the seed is anime", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/recommendations") && url.includes("page=1")) {
        return jsonResponse({ results: [tvResult(1)] });
      }
      if (url.includes("/recommendations")) return jsonResponse({ results: [] });
      if (url.includes("/similar")) {
        return jsonResponse({
          results: [
            tvResult(2, { genre_ids: [16], origin_country: ["JP"], original_language: "ja" }),
            tvResult(3), // not anime — should be dropped for an anime seed
          ],
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42", true);

    expect(results.map((r) => r.sourceId).sort()).toEqual(["1", "2"]);
  });

  it("drops results with no poster_path", async () => {
    const fetchMock = stubRecommendationPages([tvResult(1), tvResult(2, { poster_path: null })]);
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");

    expect(results.map((r) => r.sourceId)).toEqual(["1"]);
  });

  it("caps results at 20", async () => {
    const fetchMock = stubRecommendationPages(
      Array.from({ length: 25 }, (_, i) => tvResult(i + 1, { vote_count: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");

    expect(results).toHaveLength(20);
  });

  it("classifies each result independently instead of inheriting the seed's media type", async () => {
    const fetchMock = stubRecommendationPages([
      tvResult(1),
      tvResult(2, { genre_ids: [16], origin_country: ["JP"], original_language: "ja" }),
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarTv } = await import("@/lib/tmdb");

    const results = await getSimilarTv("42");

    expect(results.find((r) => r.sourceId === "1")?.mediaType).toBe("tv");
    expect(results.find((r) => r.sourceId === "2")?.mediaType).toBe("anime");
  });
});

describe("getSimilarMovie", () => {
  function movieResult(
    id: number,
    overrides: Partial<{
      poster_path: string | null;
      vote_count: number;
      vote_average: number;
      popularity: number;
    }> = {},
  ) {
    return {
      id,
      title: `Movie ${id}`,
      release_date: "2015-06-01",
      poster_path: overrides.poster_path === undefined ? "/poster.jpg" : overrides.poster_path,
      overview: null,
      vote_count: overrides.vote_count ?? 0,
      vote_average: overrides.vote_average ?? 0,
      popularity: overrides.popularity ?? 0,
    };
  }

  function stubRecommendationPages(page1Results: ReturnType<typeof movieResult>[]) {
    return vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/recommendations") && url.includes("page=1")) {
        return jsonResponse({ results: page1Results });
      }
      return jsonResponse({ results: [] });
    });
  }

  it("maps a recommendations response to SearchResult shape (mediaType always movie)", async () => {
    const fetchMock = stubRecommendationPages(
      Array.from({ length: 6 }, (_, i) => movieResult(i + 1)),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarMovie } = await import("@/lib/tmdb");

    const results = await getSimilarMovie("100");

    expect(results[0]).toEqual({
      source: "tmdb",
      sourceId: "1",
      mediaType: "movie",
      title: "Movie 1",
      year: 2015,
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      overview: null,
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/movie/100/recommendations");
  });

  it("does not call /similar when recommendations already return >= 6 usable results", async () => {
    const fetchMock = stubRecommendationPages(
      Array.from({ length: 6 }, (_, i) => movieResult(i + 1, { vote_count: 200 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarMovie } = await import("@/lib/tmdb");

    await getSimilarMovie("100");

    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("/similar");
    }
  });

  it("tops up from /similar and dedupes by id when recommendations are thin", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/recommendations") && url.includes("page=1")) {
        return jsonResponse({ results: [movieResult(1)] });
      }
      if (url.includes("/recommendations")) return jsonResponse({ results: [] });
      if (url.includes("/similar")) {
        return jsonResponse({ results: [movieResult(1), movieResult(2)] });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarMovie } = await import("@/lib/tmdb");

    const results = await getSimilarMovie("100");

    expect(results.map((r) => r.sourceId).sort()).toEqual(["1", "2"]);
  });

  it("drops posterless results and caps at 20", async () => {
    const fetchMock = stubRecommendationPages([
      ...Array.from({ length: 25 }, (_, i) => movieResult(i + 1, { vote_count: 200 })),
      movieResult(999, { poster_path: null, vote_count: 200 }),
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const { getSimilarMovie } = await import("@/lib/tmdb");

    const results = await getSimilarMovie("100");

    expect(results).toHaveLength(20);
    expect(results.some((r) => r.sourceId === "999")).toBe(false);
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
