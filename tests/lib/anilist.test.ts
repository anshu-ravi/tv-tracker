import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../helpers/fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("searchAnime", () => {
  it("returns [] without calling fetch for an empty query", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { searchAnime } = await import("@/lib/anilist");

    const results = await searchAnime("  ");

    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps AniList search results to SearchResult shape, preferring english title and stripping HTML", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          Page: {
            media: [
              {
                id: 101,
                title: {
                  romaji: "Shingeki no Kyojin",
                  english: "Attack on Titan",
                  native: "進撃の巨人",
                },
                coverImage: { large: "https://example.com/cover.jpg" },
                description: "Humanity fights back.<br>Season one.",
                episodes: 25,
                startDate: { year: 2013 },
              },
              {
                id: 102,
                title: { romaji: "Only Romaji", english: null, native: null },
                coverImage: null,
                description: null,
                episodes: null,
                startDate: { year: null },
              },
            ],
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { searchAnime } = await import("@/lib/anilist");

    const results = await searchAnime("attack on titan");

    expect(results).toEqual([
      {
        source: "anilist",
        sourceId: "101",
        mediaType: "anime",
        title: "Attack on Titan",
        year: 2013,
        posterUrl: "https://example.com/cover.jpg",
        overview: "Humanity fights back.\nSeason one.",
      },
      {
        source: "anilist",
        sourceId: "102",
        mediaType: "anime",
        title: "Only Romaji",
        year: null,
        posterUrl: null,
        overview: null,
      },
    ]);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body.variables).toEqual({ search: "attack on titan" });
  });

  it("throws when the GraphQL response contains errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ errors: [{ message: "Not Found." }] }),
      ),
    );
    const { searchAnime } = await import("@/lib/anilist");

    await expect(searchAnime("nonexistent")).rejects.toThrow(
      "AniList error: Not Found.",
    );
  });
});

describe("getAnimeTitle", () => {
  function stubDetailFetch(media: Record<string, unknown>) {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { Media: media } }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("builds a normalized title with season-1/absolute-numbered episodes", async () => {
    stubDetailFetch({
      id: 101,
      title: {
        romaji: "Shingeki no Kyojin",
        english: "Attack on Titan",
        native: "進撃の巨人",
      },
      coverImage: {
        extraLarge: "https://example.com/xl.jpg",
        large: "https://example.com/l.jpg",
      },
      bannerImage: "https://example.com/banner.jpg",
      description: "Humanity fights back.",
      episodes: 3,
      status: "RELEASING",
      startDate: { year: 2013, month: 4, day: 7 },
      nextAiringEpisode: { airingAt: 1785000000, episode: 4 },
      airingSchedule: {
        nodes: [
          { episode: 1, airingAt: 1365321600 },
          { episode: 2, airingAt: 1365926400 },
        ],
      },
    });
    const { getAnimeTitle } = await import("@/lib/anilist");

    const { title, episodes } = await getAnimeTitle("101");

    expect(title).toEqual({
      source: "anilist",
      sourceId: "101",
      mediaType: "anime",
      title: "Attack on Titan",
      originalTitle: "進撃の巨人",
      posterUrl: "https://example.com/xl.jpg",
      backdropUrl: "https://example.com/banner.jpg",
      overview: "Humanity fights back.",
      firstAirDate: "2013-04-07",
      releaseStatus: "RELEASING",
      isRunning: true,
      totalEpisodes: 3,
      nextEpisodeAirDate: new Date(1785000000 * 1000).toISOString().slice(0, 10),
      nextEpisodeLabel: "E4",
    });

    expect(episodes).toEqual([
      {
        seasonNumber: 1,
        episodeNumber: 1,
        absoluteNumber: 1,
        name: null,
        airDate: new Date(1365321600 * 1000).toISOString().slice(0, 10),
      },
      {
        seasonNumber: 1,
        episodeNumber: 2,
        absoluteNumber: 2,
        name: null,
        airDate: new Date(1365926400 * 1000).toISOString().slice(0, 10),
      },
      {
        seasonNumber: 1,
        episodeNumber: 3,
        absoluteNumber: 3,
        name: null,
        airDate: null,
      },
    ]);
  });

  it("falls back to the airing schedule's max episode when `episodes` is unknown", async () => {
    stubDetailFetch({
      id: 202,
      title: { romaji: "Ongoing Show", english: null, native: null },
      coverImage: null,
      bannerImage: null,
      description: null,
      episodes: null,
      status: "RELEASING",
      startDate: { year: null, month: null, day: null },
      nextAiringEpisode: null,
      airingSchedule: {
        nodes: [
          { episode: 1, airingAt: 1600000000 },
          { episode: 5, airingAt: 1600500000 },
        ],
      },
    });
    const { getAnimeTitle } = await import("@/lib/anilist");

    const { title, episodes } = await getAnimeTitle("202");

    expect(title.totalEpisodes).toBeNull();
    expect(title.firstAirDate).toBeNull();
    expect(title.nextEpisodeAirDate).toBeNull();
    expect(title.nextEpisodeLabel).toBeNull();
    expect(episodes).toHaveLength(5);
    expect(episodes[4]).toEqual({
      seasonNumber: 1,
      episodeNumber: 5,
      absoluteNumber: 5,
      name: null,
      airDate: new Date(1600500000 * 1000).toISOString().slice(0, 10),
    });
  });

  it("marks isRunning false for finished/cancelled shows", async () => {
    stubDetailFetch({
      id: 303,
      title: { romaji: "Finished Show", english: null, native: null },
      coverImage: null,
      bannerImage: null,
      description: null,
      episodes: 0,
      status: "FINISHED",
      startDate: { year: null, month: null, day: null },
      nextAiringEpisode: null,
      airingSchedule: { nodes: [] },
    });
    const { getAnimeTitle } = await import("@/lib/anilist");

    const { title, episodes } = await getAnimeTitle("303");

    expect(title.isRunning).toBe(false);
    expect(episodes).toEqual([]);
  });
});
