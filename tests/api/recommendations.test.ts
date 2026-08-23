import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient, mockBuildRecommendations } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockBuildRecommendations: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
// buildRecommendations is never imported by the GET route, but mocking it
// here lets "does not trigger a rebuild" assert that directly rather than
// relying on the route module simply not importing it.
vi.mock("@/lib/api/recommendations", () => ({ buildRecommendations: mockBuildRecommendations }));

afterEach(() => {
  vi.clearAllMocks();
});

async function callGet() {
  const { GET } = await import("@/app/api/recommendations/route");
  return GET();
}

const recommendationRows = [
  {
    source: "tmdb",
    source_id: "1",
    media_type: "tv",
    title: "Low Score",
    poster_url: null,
    overview: null,
    year: 2020,
    score: 1.5,
    rail: "for_you_tv",
    seed_title_id: null,
  },
  {
    source: "tmdb",
    source_id: "2",
    media_type: "tv",
    title: "High Score",
    poster_url: null,
    overview: null,
    year: 2021,
    score: 4.2,
    rail: "for_you_tv",
    seed_title_id: null,
  },
  {
    source: "tmdb",
    source_id: "3",
    media_type: "movie",
    title: "A Movie",
    poster_url: null,
    overview: null,
    year: 2019,
    score: 2.0,
    rail: "because:seed-title-1",
    seed_title_id: "seed-title-1",
  },
];

describe("GET /api/recommendations", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callGet();

    expect(response.status).toBe(401);
  });

  it("does not trigger a rebuild", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          recommendations: { data: [], error: null },
        },
      }),
    );

    await callGet();

    expect(mockBuildRecommendations).not.toHaveBeenCalled();
  });

  it("groups rows by rail, sorts each rail by score desc, and resolves the because rail's seed title", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: {
          recommendations: { data: recommendationRows, error: null },
          titles: {
            data: [{ id: "seed-title-1", title: "Finished Show", poster_url: "/p.jpg" }],
            error: null,
          },
        },
      }),
    );

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    const forYouTv = body.rails.find((r: { rail: string }) => r.rail === "for_you_tv");
    expect(forYouTv.items.map((i: { sourceId: string }) => i.sourceId)).toEqual(["2", "1"]);
    expect(forYouTv.seedTitle).toBeNull();

    const because = body.rails.find((r: { rail: string }) => r.rail === "because:seed-title-1");
    expect(because.seedTitle).toEqual({
      titleId: "seed-title-1",
      title: "Finished Show",
      posterUrl: "/p.jpg",
    });
    expect(because.items[0].sourceId).toBe("3");
  });

  it("returns an empty rails list when nothing has been computed yet", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({
        user: { id: "user-1" },
        tableResults: { recommendations: { data: [], error: null } },
      }),
    );

    const response = await callGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rails).toEqual([]);
  });
});
