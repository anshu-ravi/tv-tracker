"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Segmented control shown atop the four library routes (TV, Anime,
// Watchlist, Lists) so the bottom nav's single "Library" tab can fan out
// into a proper sub-section. Client component for the active pathname.
const SEGMENTS = [
  { href: "/tv", label: "TV" },
  { href: "/anime", label: "Anime" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/lists", label: "Lists" },
] as const;

export default function LibrarySubnav() {
  const pathname = usePathname();

  return (
    <nav className="px-4 pt-4">
      <ul className="hard-shadow-sm flex overflow-hidden rounded-[10px] border-[3px] border-ink">
        {SEGMENTS.map((segment) => {
          const active = pathname.startsWith(segment.href);

          return (
            <li key={segment.href} className="flex-1">
              <Link
                href={segment.href}
                className={`flex items-center justify-center border-r-[3px] border-ink px-1 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors last:border-r-0 ${
                  active ? "bg-acid text-ink" : "bg-paper text-ink-soft"
                }`}
              >
                {segment.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
