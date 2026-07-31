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

    const builder = fake.builders.user_titles[0];
    const update = builder.calls.find((c) => c.method === "update");
    expect(update?.args[0]).toEqual({ status: "completed" });
    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["title_id", "title-1"] },
      { method: "eq", args: ["user_id", "user-1"] },
    ]);
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
