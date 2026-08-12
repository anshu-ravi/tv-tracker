"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { decideScrollAction } from "@/lib/scrollRestoration";

// The app shell's only scrolling element. Everything else (header, bottom
// nav) is a static flex child of a fixed-height (`h-dvh`) column, so iOS's
// visual-vs-layout-viewport split can no longer strand a `position: fixed`
// bottom nav mid-screen — there is nothing fixed to strand.
//
// Trade-off: taking over the scroll container means we also take over scroll
// restoration. The browser/Next.js only restore `window`'s scroll offset on
// back/forward navigation; a nested `<main>` scrollTop is invisible to that
// mechanism. This component reimplements the same behavior by hand: save
// each route's scroll offset keyed by pathname, restore it on a popstate
// (back/forward) navigation, and reset to top on a normal forward
// navigation (matching next/link's default `scroll: true`).
//
// Grows for the tab's lifetime and is never pruned — deliberate, not an
// oversight. It's bounded by the number of distinct routes visited in one
// session (this app has a few dozen routes total), nowhere near large
// enough to be worth the complexity of an eviction policy.
const scrollPositions = new Map<string, number>();

export default function ScrollableMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const prevPathname = useRef(pathname);
  const isPopNavigation = useRef(false);

  // Mirrors `pathname`, but updated from the unconditional layout effect
  // below rather than during render (writing a ref during render is a
  // React-hooks lint error, and unnecessary here — being current by the end
  // of the synchronous layout-effect phase is early enough: any 'scroll'
  // event, including one triggered by this component's own programmatic
  // `scrollTop` writes, can only fire *after* that phase completes and
  // control returns to the browser). The scroll listener below reads this
  // instead of closing over `pathname`; see that effect for why.
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    const handlePopState = () => {
      isPopNavigation.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Runs before paint so the restored/reset position never flashes at the
  // wrong offset. Only fires on a genuine pathname change — that's what the
  // `[pathname]` dependency array guarantees — so a query-string-only
  // navigation (usePathname() ignores query strings) never reaches this
  // body at all.
  useLayoutEffect(() => {
    const decision = decideScrollAction({
      pathname,
      prevPathname: prevPathname.current,
      isPopNavigation: isPopNavigation.current,
      savedPosition: scrollPositions.get(pathname),
    });
    if (decision.type === "skip") return;
    prevPathname.current = pathname;

    const el = ref.current;
    if (!el) return;
    el.scrollTop = decision.type === "restore" ? decision.scrollTop : 0;
  }, [pathname]);

  // Runs after *every* commit — deliberately has no dependency array,
  // unlike the effect above — to do two bits of always-current bookkeeping:
  //
  // 1. Clear the pop-navigation flag. This is what keeps it from leaking
  //    across navigations: a popstate whose URL differs only by query
  //    string, or one that happens to land back on the exact same
  //    pathname, still sets the flag via the listener above, but never
  //    changes `pathname` — so the effect above bails out via "skip" and
  //    never gets a chance to consume it. Without this, a flag set by such
  //    a popstate would sit there until some *later*, unrelated pathname
  //    change, which would then be wrongly treated as a back/forward and
  //    restore a stale offset instead of resetting to top.
  //
  //    Declared after the effect above so, on commits where both run (a
  //    genuine pathname change), this one always runs second — ordering
  //    guarantees it can't clear the flag before the other effect reads
  //    it. Because it doesn't touch `ref.current` at all, a null ref on
  //    the effect above (which makes that effect a no-op) still doesn't
  //    strand the flag: this effect clears it regardless.
  //
  // 2. Sync `pathnameRef` — see its declaration for why a ref instead of
  //    just reading `pathname`, and why here (end of the synchronous
  //    layout-effect phase) is early enough.
  useLayoutEffect(() => {
    isPopNavigation.current = false;
    pathnameRef.current = pathname;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Attached once for the component's lifetime — no dependency on
    // `pathname` — and reads `pathnameRef.current` rather than closing
    // over `pathname`. A listener re-created per pathname (the previous
    // version of this component did that) would close over whichever
    // pathname was active when it was (re)attached. The layout effect
    // above's own `el.scrollTop = ...` write dispatches an async native
    // 'scroll' event whose timing relative to React's effect flush isn't
    // guaranteed by spec; if that event landed on a stale closure still
    // bound to the OUTGOING route, it would clobber that route's saved
    // offset with the new route's value. Reading a ref that's kept current
    // by the unconditional layout effect above — which always finishes
    // before any deferred scroll event can fire — removes that race
    // instead of relying on timing.
    const handleScroll = () => {
      scrollPositions.set(pathnameRef.current, el.scrollTop);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <main ref={ref} className="flex-1 overflow-y-auto overscroll-contain">
      {children}
    </main>
  );
}
