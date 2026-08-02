import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

function patchStatus(body: unknown) {
  return new NextRequest("http://localhost/api/titles/title-1/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPatch(titleId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/titles/[titleId]/status/route");
  return PATCH(patchStatus(body), { params: Promise.resolve({ titleId }) });
}

describe("PATCH /api/titles/:titleId/status", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPatch("title-1", { status: "completed" });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid status with 400", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({ user: { id: "user-1" } }),
    );

    const response = await callPatch("title-1", { status: "watching-lots" });

    expect(response.status).toBe(400);
  });

  it("updates the caller's user_titles row and returns it", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: {
          data: { title_id: "title-1", status: "completed" },
          error: null,
        },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("title-1", { status: "completed" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userTitle).toEqual({
      title_id: "title-1",
      status: "completed",
    });

    // builders[0] is the pre-update current-status lookup, builders[1] is
    // the actual update call.
    const builder = fake.builders.user_titles[1];
    const update = builder.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ status: "completed" });
    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["title_id", "title-1"] },
      { method: "eq", args: ["user_id", "user-1"] },
    ]);
  });

  it("marks all episodes watched when the new status is completed", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: {
          data: { title_id: "title-1", status: "watching" },
          error: null,
        },
        episodes: {
          data: [{ id: "ep-1" }, { id: "ep-2" }],
          error: null,
        },
        watched_episodes: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("title-1", { status: "completed" });

    expect(response.status).toBe(200);

    const watchedUpsert = fake.builders.watched_episodes[0].calls.find(
      (c) => c.method === "upsert",
    );
    expect(watchedUpsert?.args[0]).toEqual([
      { episode_id: "ep-1", title_id: "title-1", watched_at: null },
      { episode_id: "ep-2", title_id: "title-1", watched_at: null },
    ]);
    expect(watchedUpsert?.args[1]).toEqual({
      onConflict: "user_id,episode_id",
      ignoreDuplicates: true,
    });
  });

  it("unmarks watched episodes when leaving completed", async () => {
    // The pre-update lookup and the post-update read share the same
    // tableResults entry (the fake resolves per-table, not per-call), so
    // configuring user_titles to report "completed" simulates the previous
    // status and exercises the unmark path (title_id-scoped delete on
    // watched_episodes) whenever the new status isn't completed.
    const fakeWasCompleted = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: {
          data: { title_id: "title-1", status: "completed" },
          error: null,
        },
        watched_episodes: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fakeWasCompleted);

    const response = await callPatch("title-1", { status: "dnf" });

    expect(response.status).toBe(200);

    const watchedBuilder = fakeWasCompleted.builders.watched_episodes[0];
    expect(watchedBuilder.calls[0].method).toBe("delete");
    const eqCalls = watchedBuilder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([{ method: "eq", args: ["title_id", "title-1"] }]);
  });

  it("returns 404 when the title is not in the caller's list", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("title-missing", { status: "dnf" });

    expect(response.status).toBe(404);
  });

  it("returns 500 when the update errors", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: { data: null, error: { message: "db error" } },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("title-1", { status: "dnf" });

    expect(response.status).toBe(500);
  });
});
