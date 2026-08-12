// Pure decision logic behind ScrollableMain's hand-rolled scroll
// restoration, factored out so it's unit-testable without a DOM. The
// component wires this to `<main>`'s scrollTop; this module just answers
// "given a navigation, what should happen to the scroll position."

export type ScrollDecision =
  | { type: "skip" } // not a real pathname change (mount, or a query-only nav usePathname() can't see) — leave scroll alone
  | { type: "restore"; scrollTop: number } // back/forward to a route we have a saved offset for
  | { type: "reset" }; // forward navigation, or a back/forward with nothing saved for it yet

export function decideScrollAction(params: {
  pathname: string;
  prevPathname: string;
  isPopNavigation: boolean;
  savedPosition: number | undefined;
}): ScrollDecision {
  const { pathname, prevPathname, isPopNavigation, savedPosition } = params;

  if (pathname === prevPathname) return { type: "skip" };
  if (isPopNavigation && savedPosition !== undefined) {
    return { type: "restore", scrollTop: savedPosition };
  }
  return { type: "reset" };
}
