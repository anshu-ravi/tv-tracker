import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({ getTvTitle: vi.fn() }));
vi.mock("@/lib/anilist", () => ({ getAnimeTitle: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

function postFavorites(body: unknown) {
  return new NextRequest("http://localhost/api/favorites", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/favorites/route");
  return POST(postFavorites(body));
}

async function callDelete(titleId: string) {
  const { DELETE } = await import("@/app/api/favorites/route");
  return DELETE(
    new NextRequest(`http://localhost/api/favorites?titleId=${titleId}`, {
      method: "DELETE",
    }),
  );
}

describe("POST /api/favorites", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPost({ titleId: "title-1" });

    expect(response.status).toBe(401);
  });

  it("creates the Favorites list on first use and adds the title", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        // First call is the "does it exist" select (miss), second is the
        // insert that creates it.
        lists: [
          { data: null, error: null },
          { data: { id: "fav-list" }, error: null },
        ],
        list_titles: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost({ titleId: "title-1" });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ titleId: "title-1", favorited: true });

    // getOrCreateFavoritesList: select (miss) then insert.
    const insert = fake.builders.lists[1].calls.find(
      (c) => c.method === "insert",
    );
    expect(insert?.args[0]).toEqual({ name: "Favorites", is_favorites: true });
  });

  it("reuses an existing Favorites list and is idempotent on repeat calls", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: { data: { id: "fav-list" }, error: null },
        list_titles: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const first = await callPost({ titleId: "title-1" });
    const second = await callPost({ titleId: "title-1" });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const upserts = fake.builders.list_titles
      .map((b) => b.calls.find((c) => c.method === "upsert"))
      .filter(Boolean);
    expect(upserts).toHaveLength(2);
    for (const upsert of upserts) {
      expect(upsert?.args[0]).toEqual({
        list_id: "fav-list",
        title_id: "title-1",
      });
      expect(upsert?.args[1]).toEqual({
        onConflict: "list_id,title_id",
        ignoreDuplicates: true,
      });
    }
  });
});

describe("DELETE /api/favorites", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callDelete("title-1");

    expect(response.status).toBe(401);
  });

  it("returns favorited:false without erroring when there's no favorites list yet", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: { lists: { data: null, error: null } },
      }),
    );

    const response = await callDelete("title-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ favorited: false });
  });

  it("removes the membership row when a favorites list exists", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: { data: { id: "fav-list" }, error: null },
        list_titles: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete("title-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ favorited: false });

    const builder = fake.builders.list_titles[0];
    expect(builder.calls[0].method).toBe("delete");
    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["list_id", "fav-list"] },
      { method: "eq", args: ["title_id", "title-1"] },
    ]);
  });
});
