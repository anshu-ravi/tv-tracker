import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const LOWER_OTHER = "00000000-0000-4000-8000-000000000000";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";

async function post(body: unknown) {
  const { POST } = await import("@/app/api/friends/route");
  return POST(
    new NextRequest("http://localhost/api/friends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function get(q: string) {
  const { GET } = await import("@/app/api/friends/route");
  return GET(new NextRequest(`http://localhost/api/friends?q=${encodeURIComponent(q)}`));
}

async function patchHandle(body: unknown) {
  const { PATCH } = await import("@/app/api/account/handle/route");
  return PATCH(
    new NextRequest("http://localhost/api/account/handle", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/friends", () => {
  it("returns 401 without a session", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));
    expect((await post({ action: "request", userId: OTHER })).status).toBe(401);
  });

  it("sends a request through the RPC and passes its status back", async () => {
    const fake = createFakeSupabase({
      user: { id: ME },
      rpcResults: { send_friend_request: { data: "requested", error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const res = await post({ action: "request", userId: OTHER });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "requested" });
    expect(fake.rpcCalls).toEqual([{ method: "send_friend_request", args: [{ target: OTHER }] }]);
  });

  it("rejects a malformed user id before calling the database", async () => {
    const fake = createFakeSupabase({ user: { id: ME } });
    mockCreateClient.mockResolvedValue(fake);

    expect((await post({ action: "request", userId: "nope" })).status).toBe(400);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("maps a not-found RPC error to 404", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: ME },
        rpcResults: {
          accept_friend_request: { data: null, error: { code: "P0002", message: "request_not_found" } },
        },
      }),
    );
    expect((await post({ action: "accept", requestId: REQUEST_ID })).status).toBe(404);
  });

  it("declines a request with a plain delete", async () => {
    const fake = createFakeSupabase({ user: { id: ME } });
    mockCreateClient.mockResolvedValue(fake);

    expect((await post({ action: "decline", requestId: REQUEST_ID })).status).toBe(200);
    const calls = fake.builders.friend_requests[0].calls;
    expect(calls).toContainEqual({ method: "delete", args: [] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", REQUEST_ID] });
  });

  it("unfriends using the stored user_a < user_b ordering", async () => {
    const fake = createFakeSupabase({ user: { id: ME } });
    mockCreateClient.mockResolvedValue(fake);

    await post({ action: "unfriend", userId: LOWER_OTHER });

    const calls = fake.builders.friendships[0].calls;
    expect(calls).toContainEqual({ method: "eq", args: ["user_a", LOWER_OTHER] });
    expect(calls).toContainEqual({ method: "eq", args: ["user_b", ME] });
  });

  it("normalizes an invite code before redeeming it", async () => {
    const fake = createFakeSupabase({
      user: { id: ME },
      rpcResults: { redeem_friend_code: { data: "friends", error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const res = await post({ action: "redeem", code: "k7qx-92mb" });

    expect(await res.json()).toEqual({ status: "friends" });
    expect(fake.rpcCalls[0]).toEqual({ method: "redeem_friend_code", args: [{ p_code: "K7QX92MB" }] });
  });

  it("rejects unknown actions", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: { id: ME } }));
    expect((await post({ action: "nuke" })).status).toBe(400);
  });
});

describe("GET /api/friends", () => {
  it("skips the query for very short terms", async () => {
    const fake = createFakeSupabase({ user: { id: ME } });
    mockCreateClient.mockResolvedValue(fake);

    const res = await get("a");

    expect(await res.json()).toEqual({ results: [] });
    expect(fake.from).not.toHaveBeenCalled();
  });

  it("searches handle and display name, excluding the caller", async () => {
    const fake = createFakeSupabase({
      user: { id: ME },
      tableResults: { profiles: { data: [{ id: OTHER, handle: "fagotinho" }], error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const res = await get("fago,)");

    expect((await res.json()).results).toHaveLength(1);
    const calls = fake.builders.profiles[0].calls;
    expect(calls).toContainEqual({
      method: "or",
      args: ["handle.ilike.%fago%,display_name.ilike.%fago%"],
    });
    expect(calls).toContainEqual({ method: "neq", args: ["id", ME] });
  });
});

describe("PATCH /api/account/handle", () => {
  it("rejects an invalid handle", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: { id: ME } }));
    expect((await patchHandle({ handle: "-x" })).status).toBe(400);
  });

  it("returns 409 when the handle is taken", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: ME },
        tableResults: { profiles: { data: null, error: { code: "23505" } } },
      }),
    );
    expect((await patchHandle({ handle: "ravi" })).status).toBe(409);
  });

  it("saves a normalized handle", async () => {
    const fake = createFakeSupabase({
      user: { id: ME },
      tableResults: { profiles: { data: { handle: "anshu-r" }, error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const res = await patchHandle({ handle: "@Anshu-R" });

    expect(await res.json()).toEqual({ handle: "anshu-r" });
    expect(fake.builders.profiles[0].calls).toContainEqual({ method: "update", args: [{ handle: "anshu-r" }] });
  });
});
