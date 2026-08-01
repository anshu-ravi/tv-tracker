"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Floating bottom-tab pill for the authed app shell. Client component
// because it needs the current pathname to highlight the active tab.
//
// Floats above the bottom edge (inset by a gap + the iOS safe-area) instead
// of sitting flush against it, so it clears the home-indicator bar on
// notched iPhones and stays comfortably tappable. `env()`/`calc()` can't be
// expressed in Tailwind utilities, so the offset lives in inline `style`;
// everything else stays as utility classes.
const TABS = [
  { href: "/", label: "Home" },
  { href: "/tv", label: "TV" },
  { href: "/anime", label: "Anime" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/lists", label: "Lists" },
  { href: "/search", label: "Search" },
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
          // "/" would otherwise match every route via startsWith, so it gets
          // an exact check; every other tab matches its own subtree.
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 border-r-[3px] border-ink px-0.5 py-2.5 text-[9px] font-bold uppercase tracking-wide transition-colors last:border-r-0 ${
                  active ? "bg-acid text-ink" : "bg-paper text-ink-soft"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
