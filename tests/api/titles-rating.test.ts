import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

function patchRating(body: unknown) {
  return new NextRequest("http://localhost/api/titles/title-1/rating", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPatch(titleId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/titles/[titleId]/rating/route");
  return PATCH(patchRating(body), { params: Promise.resolve({ titleId }) });
}

describe("PATCH /api/titles/:titleId/rating", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPatch("title-1", { rating: 4.5 });

    expect(response.status).toBe(401);
  });

  it("accepts a half-step rating like 4.5", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: { data: { title_id: "title-1", rating: 4.5 }, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("title-1", { rating: 4.5 });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userTitle).toEqual({ title_id: "title-1", rating: 4.5 });

    const builder = fake.builders.user_titles[0];
    const update = builder.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ rating: 4.5 });
    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["title_id", "title-1"] },
      { method: "eq", args: ["user_id", "user-1"] },
    ]);
  });

  it("accepts a tenths rating like 4.3", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: { data: { title_id: "title-1", rating: 4.3 }, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("title-1", { rating: 4.3 });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.userTitle).toEqual({ title_id: "title-1", rating: 4.3 });

    const update = fake.builders.user_titles[0].calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ rating: 4.3 });
  });

  it("accepts null to clear a rating", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        user_titles: { data: { title_id: "title-1", rating: null }, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("title-1", { rating: null });

    expect(response.status).toBe(200);
    const update = fake.builders.user_titles[0].calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ rating: null });
  });

  it.each([
    ["below the minimum", 0],
    ["above the maximum", 5.5],
    ["not on the 0.1 grid", 4.25],
    ["not numeric", "4.5"],
  ])("rejects a rating that is %s with 400", async (_label, rating) => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: { id: "user-1" } }));

    const response = await callPatch("title-1", { rating });

    expect(response.status).toBe(400);
  });

  it("returns 404 when the title is not in the caller's list", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: { user_titles: { data: null, error: null } },
      }),
    );

    const response = await callPatch("title-missing", { rating: 3 });

    expect(response.status).toBe(404);
  });

  it("returns 500 when the update errors", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: { user_titles: { data: null, error: { message: "db error" } } },
      }),
    );

    const response = await callPatch("title-1", { rating: 3 });

    expect(response.status).toBe(500);
  });

  it("scopes the update to only the caller's row, never another user's", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-42" },
      tableResults: {
        user_titles: { data: { title_id: "title-1", rating: 2 }, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    await callPatch("title-1", { rating: 2 });

    const eqCalls = fake.builders.user_titles[0].calls.filter((c) => c.method === "eq");
    expect(eqCalls).toContainEqual({ method: "eq", args: ["user_id", "user-42"] });
  });
});
