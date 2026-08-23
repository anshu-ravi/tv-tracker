"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Segmented control shown atop the five library routes (TV, Anime, Movies,
// Watchlist, Lists) so the bottom nav's single "Library" tab can fan out
// into a proper sub-section. Client component for the active pathname.
const SEGMENTS = [
  { href: "/tv", label: "TV" },
  { href: "/anime", label: "Anime" },
  { href: "/movies", label: "Movies" },
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
            <li key={segment.href} className="min-w-0 flex-1">
              <Link
                href={segment.href}
                // Five segments no longer fit this control's original
                // 4-up padding/text size at a 390px phone width — tighter
                // horizontal padding and a smaller uppercase size keep
                // every label on one line without shrinking the tap
                // target's height or dropping the hard-border/acid-accent
                // "Bold" treatment.
                className={`flex items-center justify-center overflow-hidden border-r-[3px] border-ink px-0.5 py-2 text-[9px] font-bold uppercase tracking-wide transition-colors last:border-r-0 ${
                  active ? "bg-acid text-ink" : "bg-paper text-ink-soft"
                }`}
              >
                <span className="truncate">{segment.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
