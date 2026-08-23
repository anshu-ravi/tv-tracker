import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import type {
  NormalizedEpisode,
  NormalizedMovieEpisode,
  NormalizedTitle,
} from "@/lib/types";

const { mockCreateClient, mockGetTvTitle, mockGetMovieTitle } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetTvTitle: vi.fn(),
  mockGetMovieTitle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({
  getTvTitle: mockGetTvTitle,
  getMovieTitle: mockGetMovieTitle,
}));

const normalizedTitle: NormalizedTitle = {
  source: "tmdb",
  sourceId: "42",
  mediaType: "tv",
  title: "Severance",
  isRunning: true,
};

const normalizedEpisodes: NormalizedEpisode[] = [
  { seasonNumber: 1, episodeNumber: 1 },
  { seasonNumber: 1, episodeNumber: 2 },
];

const normalizedMovieTitle: NormalizedTitle = {
  source: "tmdb",
  sourceId: "27205",
  mediaType: "movie",
  title: "Inception",
  isRunning: false,
};

const normalizedMovieEpisode: NormalizedMovieEpisode = {
  name: "Inception",
  overview: "A thief who steals corporate secrets.",
  airDate: "2010-07-15",
  stillUrl: null,
  runtime: 148,
};

beforeEach(() => {
  mockGetTvTitle.mockResolvedValue({
    title: normalizedTitle,
    episodes: normalizedEpisodes,
  });
  mockGetMovieTitle.mockResolvedValue({
    title: normalizedMovieTitle,
    episode: normalizedMovieEpisode,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function postTitles(body: unknown) {
  return new NextRequest("http://localhost/api/titles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/titles/route");
  return POST(postTitles(body));
}

describe("POST /api/titles", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPost({
      source: "tmdb",
      sourceId: "42",
      mediaType: "tv",
      status: "watching",
    });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid status with 400", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({ user: { id: "user-1" } }),
    );

    const response = await callPost({
      source: "tmdb",
      sourceId: "42",
      mediaType: "tv",
      status: "binging",
    });

    expect(response.status).toBe(400);
    expect(mockGetTvTitle).not.toHaveBeenCalled();
  });

  it("rejects a genuinely unsupported source/mediaType combination with 400", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({ user: { id: "user-1" } }),
    );

    // tv, anime, and movie are all TMDB-only now (AniList has been retired
    // — see classifyTmdbSearchResult in lib/tmdb.ts). "anilist" is the one
    // remaining combination with no provider client.
    const response = await callPost({
      source: "anilist",
      sourceId: "42",
      mediaType: "anime",
      status: "watching",
    });

    expect(response.status).toBe(400);
    expect(mockGetTvTitle).not.toHaveBeenCalled();
    expect(mockGetMovieTitle).not.toHaveBeenCalled();
  });

  // Movies were unconditionally rejected as "unsupported" until this
  // branch — this used to be the same test as above (movie + tmdb posted
  // as the 400 case) until HANDOFF.md flagged that test as having quietly
  // stopped testing anything once movies became a real, supported
  // combination. It now asserts the success path instead; the rejection
  // that still legitimately applies to movies (no "watching" bucket) has
  // its own test below.
  it("adds a movie via getMovieTitle and returns 201 for a supported bucket", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        titles: { data: { id: "movie-title-1" }, error: null },
        user_titles: {
          data: { title_id: "movie-title-1", status: "watchlist" },
          error: null,
        },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost({
      source: "tmdb",
      sourceId: "27205",
      mediaType: "movie",
      status: "watchlist",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockGetMovieTitle).toHaveBeenCalledWith("27205");
    expect(mockGetTvTitle).not.toHaveBeenCalled();
    expect(body.titleId).toBe("movie-title-1");

    // Movies go through upsert_movie_episode (an RPC — PostgREST can't
    // target the partial unique index that protects the single synthetic
    // NULL-coordinate episode row via .upsert(onConflict:...)), never the
    // regular "episodes" table upsert used for tv/anime.
    expect(fake.rpc).toHaveBeenCalledWith("upsert_movie_episode", {
      p_title_id: "movie-title-1",
      p_name: "Inception",
      p_overview: "A thief who steals corporate secrets.",
      p_air_date: "2010-07-15",
      p_still_url: null,
      p_runtime: 148,
    });
    expect(fake.builders.episodes).toBeUndefined();
  });

  it("rejects a movie with status watching with 400, before touching the catalog", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({ user: { id: "user-1" } }),
    );

    // Product decision: movies have no "watching" bucket (watchlist /
    // completed / dnf only) — see CLAUDE.md. Enforced server-side, not just
    // in UI.
    const response = await callPost({
      source: "tmdb",
      sourceId: "27205",
      mediaType: "movie",
      status: "watching",
    });

    expect(response.status).toBe(400);
    expect(mockGetMovieTitle).not.toHaveBeenCalled();
  });

  it("fetches details, upserts titles/episodes/user_titles, and returns 201", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        titles: { data: { id: "title-1" }, error: null },
        user_titles: {
          data: { title_id: "title-1", status: "watching" },
          error: null,
        },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost({
      source: "tmdb",
      sourceId: "42",
      mediaType: "tv",
      status: "watching",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockGetTvTitle).toHaveBeenCalledWith("42");
    expect(body.titleId).toBe("title-1");
    expect(body.userTitle).toEqual({
      title_id: "title-1",
      status: "watching",
    });

    expect(fake.from).toHaveBeenCalledWith("titles");
    expect(fake.from).toHaveBeenCalledWith("episodes");
    expect(fake.from).toHaveBeenCalledWith("user_titles");

    const titlesUpsert = fake.builders.titles[0].calls.find(
      (c) => c.method === "upsert",
    );
    expect(titlesUpsert?.args[1]).toEqual({
      onConflict: "source,source_id,source_namespace",
    });

    const episodesUpsert = fake.builders.episodes[0].calls.find(
      (c) => c.method === "upsert",
    );
    expect(episodesUpsert?.args[1]).toEqual({
      onConflict: "title_id,season_number,episode_number",
    });
    const episodeRows = episodesUpsert?.args[0] as { title_id: string }[];
    expect(episodeRows).toHaveLength(2);
    expect(episodeRows[0].title_id).toBe("title-1");

    const userTitlesUpsert = fake.builders.user_titles[0].calls.find(
      (c) => c.method === "upsert",
    );
    expect(userTitlesUpsert?.args[0]).toEqual({
      title_id: "title-1",
      status: "watching",
    });
    expect(userTitlesUpsert?.args[1]).toEqual({
      onConflict: "user_id,title_id",
    });
  });

  it("routes anime/tmdb requests through getTvTitle with mediaType anime", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        titles: { data: { id: "title-2" }, error: null },
        user_titles: {
          data: { title_id: "title-2", status: "watchlist" },
          error: null,
        },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost({
      source: "tmdb",
      sourceId: "202",
      mediaType: "anime",
      status: "watchlist",
    });

    expect(response.status).toBe(201);
    expect(mockGetTvTitle).toHaveBeenCalledWith("202", { mediaType: "anime" });
  });

  it("marks all episodes watched when added directly as completed", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        titles: { data: { id: "title-1" }, error: null },
        user_titles: {
          data: { title_id: "title-1", status: "completed" },
          error: null,
        },
        episodes: { data: [{ id: "ep-1" }, { id: "ep-2" }], error: null },
        watched_episodes: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost({
      source: "tmdb",
      sourceId: "42",
      mediaType: "tv",
      status: "completed",
    });

    expect(response.status).toBe(201);

    const watchedUpsert = fake.builders.watched_episodes[0].calls.find(
      (c) => c.method === "upsert",
    );
    expect(watchedUpsert?.args[0]).toEqual([
      { episode_id: "ep-1", title_id: "title-1", watched_at: null },
      { episode_id: "ep-2", title_id: "title-1", watched_at: null },
    ]);
  });

  it("returns 500 when the titles upsert fails", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        titles: { data: null, error: { message: "db error" } },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost({
      source: "tmdb",
      sourceId: "42",
      mediaType: "tv",
      status: "watching",
    });

    expect(response.status).toBe(500);
  });
});
