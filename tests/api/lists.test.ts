import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

function postLists(body: unknown) {
  return new NextRequest("http://localhost/api/lists", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/lists/route");
  return POST(postLists(body));
}

function patchList(body: unknown) {
  return new NextRequest("http://localhost/api/lists/list-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPatch(listId: string, body: unknown) {
  const { PATCH } = await import("@/app/api/lists/[listId]/route");
  return PATCH(patchList(body), { params: Promise.resolve({ listId }) });
}

async function callDelete(listId: string) {
  const { DELETE } = await import("@/app/api/lists/[listId]/route");
  return DELETE(
    new NextRequest(`http://localhost/api/lists/${listId}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ listId }) },
  );
}

async function callGet(url: string) {
  const { GET } = await import("@/app/api/lists/route");
  return GET(new NextRequest(url));
}

describe("GET /api/lists", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callGet("http://localhost/api/lists");

    expect(response.status).toBe(401);
  });

  it("returns lists favorites-first with counts, and contains when titleId is given", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: {
          data: [
            { id: "list-b", name: "Best of 2026", is_favorites: false },
            { id: "list-fav", name: "Favorites", is_favorites: true },
          ],
          error: null,
        },
        list_titles: {
          data: [
            { list_id: "list-b", title_id: "title-1" },
            { list_id: "list-fav", title_id: "title-2" },
          ],
          error: null,
        },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callGet(
      "http://localhost/api/lists?titleId=title-2",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.lists).toEqual([
      {
        id: "list-fav",
        name: "Favorites",
        isFavorites: true,
        titleCount: 1,
        contains: true,
      },
      {
        id: "list-b",
        name: "Best of 2026",
        isFavorites: false,
        titleCount: 1,
        contains: false,
      },
    ]);
  });

  it("returns an empty list array when the user has no lists", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: { lists: { data: [], error: null } },
      }),
    );

    const response = await callGet("http://localhost/api/lists");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ lists: [] });
  });
});

describe("POST /api/lists", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPost({ name: "Comfort watches" });

    expect(response.status).toBe(401);
  });

  it("rejects an empty name with 400", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({ user: { id: "user-1" } }),
    );

    const response = await callPost({ name: "   " });

    expect(response.status).toBe(400);
  });

  it("creates a list and returns it", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: {
          data: { id: "list-1", name: "Comfort watches", is_favorites: false },
          error: null,
        },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost({ name: "Comfort watches" });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.list).toEqual({
      id: "list-1",
      name: "Comfort watches",
      isFavorites: false,
      titleCount: 0,
    });

    const insert = fake.builders.lists[0].calls.find(
      (c) => c.method === "insert",
    );
    expect(insert?.args[0]).toEqual({ name: "Comfort watches" });
  });

  it("returns 409 when the name is already taken", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: { data: null, error: { code: "23505", message: "duplicate" } },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost({ name: "Comfort watches" });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("A list with that name already exists");
  });
});

describe("PATCH /api/lists/:listId", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPatch("list-1", { name: "New name" });

    expect(response.status).toBe(401);
  });

  it("rejects renaming the Favorites list with 400", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: { data: { id: "list-1", is_favorites: true }, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("list-1", { name: "New name" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot rename the Favorites list");
  });

  it("returns 404 when the list doesn't exist", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: { lists: { data: null, error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPatch("list-missing", { name: "New name" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/lists/:listId", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callDelete("list-1");

    expect(response.status).toBe(401);
  });

  it("rejects deleting the Favorites list with 400", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: { data: { id: "list-1", is_favorites: true }, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete("list-1");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Cannot delete the Favorites list");
  });

  it("deletes a non-favorites list", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: { data: { id: "list-1", is_favorites: false }, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete("list-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});
