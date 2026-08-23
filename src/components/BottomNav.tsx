"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, LibraryIcon, SearchIcon, UserIcon } from "@/components/icons";

// Docked bottom-tab bar for the authed app shell. Client component because
// it needs the current pathname to highlight the active tab.
//
// A static flex child of the app shell now, not a `position: fixed`
// floating pill (see (app)/layout.tsx for why). It sits flush against the
// bottom edge of the shell; a `padding-bottom` of the iOS safe-area inset
// keeps the tap targets clear of the home-indicator bar on notched iPhones.
// `env()` can't be expressed in Tailwind utilities, so that padding lives in
// inline `style`; everything else stays as utility classes.
//
// Four icon+label tabs. LIBRARY covers the four library routes (TV, Anime,
// Watchlist, Lists) — see LibrarySubnav for the segmented control that picks
// between them once inside that section.
const TABS = [
  { href: "/", label: "Home", Icon: HomeIcon, matchPrefixes: ["/"] as const, exact: true },
  {
    href: "/tv",
    label: "Library",
    Icon: LibraryIcon,
    matchPrefixes: ["/tv", "/anime", "/watchlist", "/lists"] as const,
    exact: false,
  },
  { href: "/explore", label: "Explore", Icon: SearchIcon, matchPrefixes: ["/explore", "/search"] as const, exact: false },
  { href: "/account", label: "Account", Icon: UserIcon, matchPrefixes: ["/account"] as const, exact: false },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="border-t-[3px] border-ink bg-paper"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="flex w-full">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === "/"
            : tab.matchPrefixes.some((prefix) => pathname.startsWith(prefix));

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                // Force the full RSC payload to prefetch, not just the
                // layout-to-loading-boundary slice Next's default "auto"
                // gives dynamic routes — there are only 4 tabs, so
                // prefetching all of them on every screen is cheap even on
                // mobile data, and it's what makes tab switches feel
                // instant instead of waiting on a server round trip.
                prefetch={true}
                className={`flex flex-col items-center gap-1 border-r-[3px] border-ink px-1 py-2.5 transition-colors last:border-r-0 ${
                  active ? "bg-acid text-ink" : "bg-paper text-ink-soft"
                }`}
              >
                <tab.Icon className="h-5 w-5" />
                <span className="text-[10px] font-bold uppercase tracking-wide">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
