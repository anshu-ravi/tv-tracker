"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

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
const scrollPositions = new Map<string, number>();

export default function ScrollableMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  const prevPathname = useRef(pathname);
  const isPopNavigation = useRef(false);

  useEffect(() => {
    const handlePopState = () => {
      isPopNavigation.current = true;
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Runs before paint so the restored/reset position never flashes at the
  // wrong offset.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prevPathname.current === pathname) return;

    if (isPopNavigation.current && scrollPositions.has(pathname)) {
      el.scrollTop = scrollPositions.get(pathname)!;
    } else {
      el.scrollTop = 0;
    }
    isPopNavigation.current = false;
    prevPathname.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleScroll = () => {
      scrollPositions.set(pathname, el.scrollTop);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  return (
    <main ref={ref} className="flex-1 overflow-y-auto overscroll-contain">
      {children}
    </main>
  );
}
