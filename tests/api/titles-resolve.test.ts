import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

async function callPost(titleId: string, body: unknown) {
  const { POST } = await import("@/app/api/titles/[titleId]/resolve/route");
  const request = new NextRequest(`http://localhost/api/titles/${titleId}/resolve`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ titleId }) });
}

describe("POST /api/titles/:titleId/resolve", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPost("title-1", { watched: true });

    expect(response.status).toBe(401);
  });

  it("rejects a body without a boolean watched", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: { id: "user-1" } }));

    const response = await callPost("title-1", { watched: "yes" });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the title has nothing pending", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: { user_titles: { data: { pending_season_check: null }, error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost("title-1", { watched: true });

    expect(response.status).toBe(404);
    expect(fake.builders.watched_episodes).toBeUndefined();
  });

  it("marks only the aired episodes of the pending season, undated, then clears the flag", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: { data: { pending_season_check: 3 }, error: null },
        episodes: {
          data: [
            { id: "ep-1", air_date: "2020-01-01" },
            { id: "ep-2", air_date: null },
            { id: "ep-3", air_date: "2999-01-01" },
          ],
          error: null,
        },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost("title-1", { watched: true });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ resolved: true, marked: 2 });

    const seasonFilter = fake.builders.episodes[0].calls.filter((c) => c.method === "eq");
    expect(seasonFilter).toContainEqual({ method: "eq", args: ["season_number", 3] });

    const upsert = fake.builders.watched_episodes[0].calls.find((c) => c.method === "upsert");
    expect(upsert?.args[0]).toEqual([
      { episode_id: "ep-1", title_id: "title-1", watched_at: null },
      { episode_id: "ep-2", title_id: "title-1", watched_at: null },
    ]);

    const clear = fake.builders.user_titles[1].calls.find((c) => c.method === "update");
    expect(clear?.args[0]).toEqual({ pending_season_check: null });
  });

  it("clears the flag without marking anything when the answer is no", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: { user_titles: { data: { pending_season_check: 2 }, error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost("title-1", { watched: false });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ resolved: true, marked: 0 });
    expect(fake.builders.episodes).toBeUndefined();
    expect(fake.builders.watched_episodes).toBeUndefined();
    const clear = fake.builders.user_titles[1].calls.find((c) => c.method === "update");
    expect(clear?.args[0]).toEqual({ pending_season_check: null });
  });
});
