import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

async function callDelete(titleId: string) {
  const { DELETE } = await import("@/app/api/titles/[titleId]/route");
  return DELETE(
    new NextRequest(`http://localhost/api/titles/${titleId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ titleId }) },
  );
}

describe("DELETE /api/titles/:titleId", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callDelete("title-1");

    expect(response.status).toBe(401);
  });

  it("removes watched_episodes then user_titles, both scoped to the caller", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        watched_episodes: { data: null, error: null },
        user_titles: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete("title-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });

    const watchedBuilder = fake.builders.watched_episodes[0];
    expect(watchedBuilder.calls[0].method).toBe("delete");
    expect(
      watchedBuilder.calls.filter((c) => c.method === "eq"),
    ).toEqual([
      { method: "eq", args: ["title_id", "title-1"] },
      { method: "eq", args: ["user_id", "user-1"] },
    ]);

    const userTitlesBuilder = fake.builders.user_titles[0];
    expect(userTitlesBuilder.calls[0].method).toBe("delete");
    expect(
      userTitlesBuilder.calls.filter((c) => c.method === "eq"),
    ).toEqual([
      { method: "eq", args: ["title_id", "title-1"] },
      { method: "eq", args: ["user_id", "user-1"] },
    ]);
  });

  it("leaves the shared catalog rows untouched (no titles/episodes calls)", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        watched_episodes: { data: null, error: null },
        user_titles: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    await callDelete("title-1");

    expect(fake.builders.titles).toBeUndefined();
    expect(fake.builders.episodes).toBeUndefined();
  });

  it("returns 500 when removing watched episodes fails", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          watched_episodes: { data: null, error: { message: "db error" } },
        },
      }),
    );

    const response = await callDelete("title-1");

    expect(response.status).toBe(500);
  });

  it("returns 500 when removing the user_titles row fails", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          watched_episodes: { data: null, error: null },
          user_titles: { data: null, error: { message: "db error" } },
        },
      }),
    );

    const response = await callDelete("title-1");

    expect(response.status).toBe(500);
  });
});
