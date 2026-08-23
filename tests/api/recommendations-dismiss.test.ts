import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

const VALID_BODY = { source: "tmdb", sourceId: "12345", mediaType: "anime" };

function request(method: "POST" | "DELETE", body: unknown) {
  return new NextRequest("http://localhost/api/recommendations/dismiss", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/recommendations/dismiss/route");
  return POST(request("POST", body));
}

async function callDelete(body: unknown) {
  const { DELETE } = await import("@/app/api/recommendations/dismiss/route");
  return DELETE(request("DELETE", body));
}

describe("POST /api/recommendations/dismiss", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPost(VALID_BODY);

    expect(response.status).toBe(401);
  });

  it.each([
    ["source is not tmdb", { source: "anilist", sourceId: "1", mediaType: "tv" }],
    ["sourceId is missing", { source: "tmdb", sourceId: "", mediaType: "tv" }],
    ["mediaType is invalid", { source: "tmdb", sourceId: "1", mediaType: "book" }],
  ])("returns 400 when %s", async (_label, body) => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: { id: "user-1" } }));

    const response = await callPost(body);

    expect(response.status).toBe(400);
  });

  it("upserts the dismissal and deletes the title from every recommendations row", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        rec_dismissals: { data: null, error: null },
        recommendations: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost(VALID_BODY);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ dismissed: true });

    const upsert = fake.builders.rec_dismissals[0].calls.find((c) => c.method === "upsert");
    expect(upsert?.args[0]).toEqual({
      source: "tmdb",
      source_id: "12345",
      media_type: "anime",
    });
    expect(upsert?.args[1]).toEqual({
      onConflict: "user_id,source,source_id,media_type",
      ignoreDuplicates: true,
    });

    const del = fake.builders.recommendations[0];
    expect(del.calls[0].method).toBe("delete");
    const eqCalls = del.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["source", "tmdb"] },
      { method: "eq", args: ["source_id", "12345"] },
      { method: "eq", args: ["media_type", "anime"] },
      { method: "eq", args: ["user_id", "user-1"] },
    ]);
  });

  it("does not error on a repeat dismissal of the same title", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          rec_dismissals: { data: null, error: null },
          recommendations: { data: null, error: null },
        },
      }),
    );

    const first = await callPost(VALID_BODY);
    const second = await callPost(VALID_BODY);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });
});

describe("DELETE /api/recommendations/dismiss", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callDelete(VALID_BODY);

    expect(response.status).toBe(401);
  });

  it("returns 400 on a bad triple", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: { id: "user-1" } }));

    const response = await callDelete({ source: "tmdb", sourceId: "", mediaType: "tv" });

    expect(response.status).toBe(400);
  });

  it("removes the matching rec_dismissals row", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: { rec_dismissals: { data: null, error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete(VALID_BODY);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ dismissed: false });

    const builder = fake.builders.rec_dismissals[0];
    expect(builder.calls[0].method).toBe("delete");
    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["source", "tmdb"] },
      { method: "eq", args: ["source_id", "12345"] },
      { method: "eq", args: ["media_type", "anime"] },
      { method: "eq", args: ["user_id", "user-1"] },
    ]);
  });
});
