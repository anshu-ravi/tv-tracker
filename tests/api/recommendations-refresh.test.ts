import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient, mockBuildRecommendations } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockBuildRecommendations: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));
vi.mock("@/lib/api/recommendations", () => ({ buildRecommendations: mockBuildRecommendations }));

beforeEach(() => {
  mockCreateClient.mockResolvedValue(createFakeSupabase({ user: { id: "user-1" } }));
  mockBuildRecommendations.mockResolvedValue({
    seedsUsed: 5,
    candidatesConsidered: 12,
    railCounts: { for_you_tv: 3 },
    errors: [],
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function callRefresh() {
  const { POST } = await import("@/app/api/recommendations/refresh/route");
  return POST();
}

describe("POST /api/recommendations/refresh", () => {
  it("returns 401 when there is no signed-in user", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const response = await callRefresh();

    expect(response.status).toBe(401);
    expect(mockBuildRecommendations).not.toHaveBeenCalled();
  });

  it("calls buildRecommendations for the signed-in user and returns its summary", async () => {
    const response = await callRefresh();
    const body = await response.json();

    expect(mockBuildRecommendations).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      seedsUsed: 5,
      candidatesConsidered: 12,
      railCounts: { for_you_tv: 3 },
      errors: [],
    });
  });

  it("returns 500 when buildRecommendations throws", async () => {
    mockBuildRecommendations.mockRejectedValue(new Error("boom"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await callRefresh();

    expect(response.status).toBe(500);
    consoleErrorSpy.mockRestore();
  });
});
