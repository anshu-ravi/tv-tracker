import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRedirect } = vi.hoisted(() => ({ mockRedirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));

afterEach(() => {
  vi.clearAllMocks();
});

// The Search tab moved to /explore; /search must keep redirecting so old
// bookmarks/links still work (see (app)/search/page.tsx).
describe("GET /search", () => {
  it("redirects to /explore", async () => {
    const { default: SearchPage } = await import("@/app/(app)/search/page");

    SearchPage();

    expect(mockRedirect).toHaveBeenCalledWith("/explore");
  });
});
