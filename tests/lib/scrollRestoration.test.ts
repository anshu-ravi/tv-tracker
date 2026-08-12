import { describe, expect, it } from "vitest";
import { decideScrollAction } from "@/lib/scrollRestoration";

describe("decideScrollAction", () => {
  it("skips when pathname hasn't changed (mount, or a query-only navigation)", () => {
    expect(
      decideScrollAction({
        pathname: "/tv",
        prevPathname: "/tv",
        isPopNavigation: false,
        savedPosition: 2000,
      }),
    ).toEqual({ type: "skip" });

    // A popstate can leave isPopNavigation true even when the pathname is
    // unchanged (e.g. a query-string-only back/forward, which usePathname()
    // can't see) — that must still resolve to "skip", not "restore".
    expect(
      decideScrollAction({
        pathname: "/search",
        prevPathname: "/search",
        isPopNavigation: true,
        savedPosition: 500,
      }),
    ).toEqual({ type: "skip" });
  });

  it("resets to top on a normal forward navigation", () => {
    expect(
      decideScrollAction({
        pathname: "/title/abc",
        prevPathname: "/tv",
        isPopNavigation: false,
        savedPosition: undefined,
      }),
    ).toEqual({ type: "reset" });
  });

  it("resets to top on a forward navigation even if that route has a stale saved offset", () => {
    // e.g. the user scrolled /title/abc before, left, and is arriving there
    // again via a fresh Link click rather than back/forward.
    expect(
      decideScrollAction({
        pathname: "/title/abc",
        prevPathname: "/tv",
        isPopNavigation: false,
        savedPosition: 900,
      }),
    ).toEqual({ type: "reset" });
  });

  it("restores the saved offset on a back/forward navigation", () => {
    expect(
      decideScrollAction({
        pathname: "/tv",
        prevPathname: "/title/abc",
        isPopNavigation: true,
        savedPosition: 2000,
      }),
    ).toEqual({ type: "restore", scrollTop: 2000 });
  });

  it("treats an explicit saved offset of 0 as a real restore, not a miss", () => {
    // savedPosition uses `!== undefined`, not truthiness, so a route that
    // was legitimately scrolled back to the top still restores correctly
    // instead of falling through to "reset".
    expect(
      decideScrollAction({
        pathname: "/tv",
        prevPathname: "/title/abc",
        isPopNavigation: true,
        savedPosition: 0,
      }),
    ).toEqual({ type: "restore", scrollTop: 0 });
  });

  it("resets to top on a back/forward navigation to a route with no saved offset yet", () => {
    expect(
      decideScrollAction({
        pathname: "/anime",
        prevPathname: "/tv",
        isPopNavigation: true,
        savedPosition: undefined,
      }),
    ).toEqual({ type: "reset" });
  });
});
