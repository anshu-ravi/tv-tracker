import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

async function callPost(episodeId: string) {
  const { POST } = await import("@/app/api/episodes/[episodeId]/watch/route");
  return POST(new NextRequest("http://localhost/api/episodes/e1/watch", { method: "POST" }), {
    params: Promise.resolve({ episodeId }),
  });
}

async function callDelete(episodeId: string) {
  const { DELETE } = await import(
    "@/app/api/episodes/[episodeId]/watch/route"
  );
  return DELETE(
    new NextRequest("http://localhost/api/episodes/e1/watch", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ episodeId }) },
  );
}

describe("POST /api/episodes/:episodeId/watch", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPost("ep-1");

    expect(response.status).toBe(401);
  });

  it("returns 404 when the episode does not exist", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: { episodes: { data: null, error: null } },
      }),
    );

    const response = await callPost("missing-ep");

    expect(response.status).toBe(404);
  });

  it("marks the episode watched, denormalizing title_id, and is idempotent", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        episodes: { data: { id: "ep-1", title_id: "title-1" }, error: null },
        watched_episodes: {
          data: { episode_id: "ep-1", title_id: "title-1" },
          error: null,
        },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost("ep-1");
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.watchedEpisode).toEqual({
      episode_id: "ep-1",
      title_id: "title-1",
    });

    const upsert = fake.builders.watched_episodes[0].calls.find(
      (c) => c.method === "upsert",
    );
    expect(upsert?.args[0]).toEqual({
      episode_id: "ep-1",
      title_id: "title-1",
    });
    expect(upsert?.args[1]).toEqual({
      onConflict: "user_id,episode_id",
      ignoreDuplicates: true,
    });
  });

  it("returns 500 when marking watched fails", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          episodes: {
            data: { id: "ep-1", title_id: "title-1" },
            error: null,
          },
          watched_episodes: { data: null, error: { message: "db error" } },
        },
      }),
    );

    const response = await callPost("ep-1");

    expect(response.status).toBe(500);
  });
});

describe("DELETE /api/episodes/:episodeId/watch", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callDelete("ep-1");

    expect(response.status).toBe(401);
  });

  it("removes the watched_episodes row scoped to the caller", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: { watched_episodes: { data: null, error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete("ep-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });

    const builder = fake.builders.watched_episodes[0];
    expect(builder.calls[0].method).toBe("delete");
    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["episode_id", "ep-1"] },
      { method: "eq", args: ["user_id", "user-1"] },
    ]);
  });

  it("returns 500 when the delete errors", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          watched_episodes: { data: null, error: { message: "db error" } },
        },
      }),
    );

    const response = await callDelete("ep-1");

    expect(response.status).toBe(500);
  });
});
