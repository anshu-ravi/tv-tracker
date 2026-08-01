import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";
import type { NormalizedEpisode, NormalizedTitle } from "@/lib/types";

const { mockCreateClient, mockGetTvTitle } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockGetTvTitle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/tmdb", () => ({ getTvTitle: mockGetTvTitle }));
vi.mock("@/lib/anilist", () => ({ getAnimeTitle: vi.fn() }));

const normalizedTitle: NormalizedTitle = {
  source: "tmdb",
  sourceId: "42",
  mediaType: "tv",
  title: "Severance",
  isRunning: true,
};
const normalizedEpisodes: NormalizedEpisode[] = [];

beforeEach(() => {
  mockGetTvTitle.mockResolvedValue({
    title: normalizedTitle,
    episodes: normalizedEpisodes,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

function postTitle(body: unknown) {
  return new NextRequest("http://localhost/api/lists/list-1/titles", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callPost(listId: string, body: unknown) {
  const { POST } = await import("@/app/api/lists/[listId]/titles/route");
  return POST(postTitle(body), { params: Promise.resolve({ listId }) });
}

async function callDelete(listId: string, titleId: string) {
  const { DELETE } = await import(
    "@/app/api/lists/[listId]/titles/[titleId]/route"
  );
  return DELETE(
    new NextRequest(
      `http://localhost/api/lists/${listId}/titles/${titleId}`,
      { method: "DELETE" },
    ),
    { params: Promise.resolve({ listId, titleId }) },
  );
}

describe("POST /api/lists/:listId/titles", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callPost("list-1", { titleId: "title-1" });

    expect(response.status).toBe(401);
  });

  it("returns 404 when the list is not the caller's", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: { lists: { data: null, error: null } },
      }),
    );

    const response = await callPost("list-missing", { titleId: "title-1" });

    expect(response.status).toBe(404);
  });

  it("adds an already-catalogued title by titleId", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: { data: { id: "list-1" }, error: null },
        list_titles: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost("list-1", { titleId: "title-1" });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.titleId).toBe("title-1");
    expect(mockGetTvTitle).not.toHaveBeenCalled();

    const upsert = fake.builders.list_titles[0].calls.find(
      (c) => c.method === "upsert",
    );
    expect(upsert?.args[0]).toEqual({
      list_id: "list-1",
      title_id: "title-1",
    });
    expect(upsert?.args[1]).toEqual({
      onConflict: "list_id,title_id",
      ignoreDuplicates: true,
    });
  });

  it("resolves the catalog title when titleId is absent", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: {
        lists: { data: { id: "list-1" }, error: null },
        titles: { data: { id: "title-42" }, error: null },
        list_titles: { data: null, error: null },
      },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callPost("list-1", {
      source: "tmdb",
      sourceId: "42",
      mediaType: "tv",
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mockGetTvTitle).toHaveBeenCalledWith("42");
    expect(body.titleId).toBe("title-42");
  });
});

describe("DELETE /api/lists/:listId/titles/:titleId", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callDelete("list-1", "title-1");

    expect(response.status).toBe(401);
  });

  it("removes the membership row", async () => {
    const fake = createFakeSupabase({
      user: { id: "user-1" },
      tableResults: { list_titles: { data: null, error: null } },
    });
    mockCreateClient.mockResolvedValue(fake);

    const response = await callDelete("list-1", "title-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });

    const builder = fake.builders.list_titles[0];
    expect(builder.calls[0].method).toBe("delete");
    const eqCalls = builder.calls.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["list_id", "list-1"] },
      { method: "eq", args: ["title_id", "title-1"] },
    ]);
  });
});
