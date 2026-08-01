"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, LibraryIcon, SearchIcon, UserIcon } from "@/components/icons";

// Floating bottom-tab pill for the authed app shell. Client component
// because it needs the current pathname to highlight the active tab.
//
// Floats above the bottom edge (inset by a gap + the iOS safe-area) instead
// of sitting flush against it, so it clears the home-indicator bar on
// notched iPhones and stays comfortably tappable. `env()`/`calc()` can't be
// expressed in Tailwind utilities, so the offset lives in inline `style`;
// everything else stays as utility classes.
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
  { href: "/search", label: "Search", Icon: SearchIcon, matchPrefixes: ["/search"] as const, exact: false },
  { href: "/account", label: "Account", Icon: UserIcon, matchPrefixes: ["/account"] as const, exact: false },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="hard-shadow fixed left-1/2 z-20 w-[calc(100%-1.5rem)] max-w-[calc(28rem-1.5rem)] -translate-x-1/2 rounded-[14px] border-[3px] border-ink bg-paper"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
    >
      <ul className="flex w-full overflow-hidden rounded-[11px]">
        {TABS.map((tab) => {
          const active = tab.exact
            ? pathname === "/"
            : tab.matchPrefixes.some((prefix) => pathname.startsWith(prefix));

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
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
