import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import type { NormalizedEpisode, NormalizedTitle } from "@/lib/types";

const { mockCreateClient, mockGetTvTitle, mockGetAnimeTitle } = vi.hoisted(
  () => ({
    mockCreateClient: vi.fn(),
    mockGetTvTitle: vi.fn(),
    mockGetAnimeTitle: vi.fn(),
  }),
);

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({ getTvTitle: mockGetTvTitle }));
vi.mock("@/lib/anilist", () => ({ getAnimeTitle: mockGetAnimeTitle }));

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

beforeEach(() => {
  mockGetTvTitle.mockResolvedValue({
    title: normalizedTitle,
    episodes: normalizedEpisodes,
  });
  mockGetAnimeTitle.mockResolvedValue({
    title: { ...normalizedTitle, source: "anilist", mediaType: "anime" },
    episodes: normalizedEpisodes,
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

  it("rejects an unsupported source/mediaType combination with 400", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({ user: { id: "user-1" } }),
    );

    const response = await callPost({
      source: "tmdb",
      sourceId: "42",
      mediaType: "anime",
      status: "watching",
    });

    expect(response.status).toBe(400);
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
    expect(titlesUpsert?.args[1]).toEqual({ onConflict: "source,source_id" });

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

  it("routes anime/anilist requests through getAnimeTitle", async () => {
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
      source: "anilist",
      sourceId: "202",
      mediaType: "anime",
      status: "watchlist",
    });

    expect(response.status).toBe(201);
    expect(mockGetAnimeTitle).toHaveBeenCalledWith("202");
    expect(mockGetTvTitle).not.toHaveBeenCalled();
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
