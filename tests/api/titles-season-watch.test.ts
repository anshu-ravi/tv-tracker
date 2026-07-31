import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

async function callPost(titleId: string, seasonNumber: string) {
  const { POST } = await import(
    "@/app/api/titles/[titleId]/season/[seasonNumber]/watch/route"
  );
  return POST(
    new NextRequest(
      `http://localhost/api/titles/${titleId}/season/${seasonNumber}/watch`,
      { method: "POST" },
    ),
    { params: Promise.resolve({ titleId, seasonNumber }) },
  );
}

async function callDelete(titleId: string, seasonNumber: string) {
  const { DELETE } = await import(
    "@/app/api/titles/[titleId]/season/[seasonNumber]/watch/route"
  );
  return DELETE(
    new NextRequest(
      `http://localhost/api/titles/${titleId}/season/${seasonNumber}/watch`,
      { method: "DELETE" },
    ),
    { params: Promise.resolve({ titleId, seasonNumber }) },
  );
}

describe("POST /api/titles/:titleId/season/:seasonNumber/watch", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPost("title-1", "1");

    expect(response.status).toBe(401);
  });

  it("marks every episode in the season watched", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        episodes: {
          data: [{ id: "ep-1" }, { id: "ep-2" }],
          error: null,
        },
        watched_episodes: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost("title-1", "1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ marked: 2 });

    const episodesBuilder = fake.builders.episodes[0];
    expect(
      episodesBuilder.calls.filter((c) => c.method === "eq"),
    ).toEqual([
      { method: "eq", args: ["title_id", "title-1"] },
      { method: "eq", args: ["season_number", 1] },
    ]);

    const upsert = fake.builders.watched_episodes[0].calls.find(
      (c) => c.method === "upsert",
    );
    expect(upsert?.args[0]).toEqual([
      { episode_id: "ep-1", title_id: "title-1" },
      { episode_id: "ep-2", title_id: "title-1" },
    ]);
    expect(upsert?.args[1]).toEqual({
      onConflict: "user_id,episode_id",
      ignoreDuplicates: true,
    });
  });

  it("is a no-op when the season has no episodes", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        episodes: { data: [], error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost("title-1", "9");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ marked: 0 });
    expect(fake.builders.watched_episodes).toBeUndefined();
  });

  it("returns 500 when the season lookup fails", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          episodes: { data: null, error: { message: "db error" } },
        },
      }),
    );

    const response = await callPost("title-1", "1");

    expect(response.status).toBe(500);
  });

  it("returns 500 when the bulk upsert fails", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          episodes: { data: [{ id: "ep-1" }], error: null },
          watched_episodes: { data: null, error: { message: "db error" } },
        },
      }),
    );

    const response = await callPost("title-1", "1");

    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/titles/:titleId/season/:seasonNumber/watch", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callDelete("title-1", "1");

    expect(response.status).toBe(401);
  });

  it("unmarks every episode in the season, scoped to the caller", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        episodes: {
          data: [{ id: "ep-1" }, { id: "ep-2" }],
          error: null,
        },
        watched_episodes: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete("title-1", "1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ unmarked: 2 });

    const builder = fake.builders.watched_episodes[0];
    expect(builder.calls[0].method).toBe("delete");
    expect(builder.calls.filter((c) => c.method === "eq")).toEqual([
      { method: "eq", args: ["user_id", "user-1"] },
      { method: "eq", args: ["title_id", "title-1"] },
    ]);
    expect(builder.calls.find((c) => c.method === "in")?.args).toEqual([
      "episode_id",
      ["ep-1", "ep-2"],
    ]);
  });

  it("is a no-op when the season has no episodes", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        episodes: { data: [], error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete("title-1", "9");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ unmarked: 0 });
    expect(fake.builders.watched_episodes).toBeUndefined();
  });

  it("returns 500 when the delete errors", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          episodes: { data: [{ id: "ep-1" }], error: null },
          watched_episodes: { data: null, error: { message: "db error" } },
        },
      }),
    );

    const response = await callDelete("title-1", "1");

    expect(response.status).toBe(500);
  });
});
