"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Fixed bottom-tab nav for the authed app shell. Client component because it
// needs the current pathname to highlight the active tab.
const TABS = [
  { href: "/", label: "Home" },
  { href: "/tv", label: "TV" },
  { href: "/anime", label: "Anime" },
  { href: "/watchlist", label: "List" },
  { href: "/search", label: "Search" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-[3px] border-ink bg-paper">
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          // "/" would otherwise match every route via startsWith, so it gets
          // an exact check; every other tab matches its own subtree.
          const active =
            tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                className={`flex flex-col items-center gap-0.5 border-r-[3px] border-ink py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors last:border-r-0 ${
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
