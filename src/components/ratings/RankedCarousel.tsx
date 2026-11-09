import Link from "next/link";
import Image from "next/image";
import type { RankedTitle } from "@/lib/ratingsRank";
import { TIER_BG, tierFor } from "@/lib/ratingTiers";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";

function Poster({ item, priority }: { item: RankedTitle; priority: boolean }) {
  return (
    <div className="relative aspect-[2/3] w-full bg-panel">
      {item.posterUrl ? (
        <Image
          src={buildTmdbImageUrl(item.posterUrl, 342)}
          alt={item.title}
          fill
          sizes="168px"
          className="object-cover"
          priority={priority}
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center">
          <span className="display text-lg text-ink-soft">{item.title}</span>
        </div>
      )}
    </div>
  );
}

const pressable = "shrink-0 snap-start transition-transform active:translate-x-[2px] active:translate-y-[2px]";

// Swipeable row of poster cards with tier-coloured rating stamps. `shelf` swaps the rank tab
// for a huge outlined numeral tucked behind each poster.
export default function RankedCarousel({ titles, shelf = false }: { titles: RankedTitle[]; shelf?: boolean }) {
  return (
    <div
      className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 pt-1"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {titles.map((item, i) => {
        const stamp = (
          <span
            className={`stamp absolute bottom-2 right-2 ${shelf ? "text-xs" : "text-base"} ${TIER_BG[tierFor(item.rating).key]}`}
          >
            {item.rating.toFixed(1)}★
          </span>
        );

        if (shelf) {
          return (
            <Link key={item.titleId} href={`/title/${item.titleId}`} className={`relative w-[156px] ${pressable}`}>
              <span
                aria-hidden
                className="display pointer-events-none absolute bottom-7 left-0 select-none text-[120px] leading-[0.8] tracking-[-0.08em] text-paper"
                style={{ WebkitTextStroke: "3px var(--color-ink)" }}
              >
                {item.rank}
              </span>
              <div className={`relative ml-auto ${item.rank >= 10 ? "w-[96px]" : "w-[108px]"}`}>
                <div className="card-bold relative overflow-hidden p-0">
                  <Poster item={item} priority={false} />
                  {stamp}
                </div>
                <p className="mt-2 truncate text-[11px] font-bold uppercase tracking-wide">{item.title}</p>
              </div>
            </Link>
          );
        }

        return (
          <Link key={item.titleId} href={`/title/${item.titleId}`} className={`w-[42vw] max-w-[168px] ${pressable}`}>
            <div className="card-bold relative overflow-hidden p-0">
              <Poster item={item} priority={i < 2} />
              <span className="display absolute left-0 top-0 border-b-[3px] border-r-[3px] border-ink bg-ink px-2 py-1 text-2xl text-paper">
                #{item.rank}
              </span>
              {stamp}
            </div>
            <p className="mt-2 truncate text-[11px] font-bold uppercase tracking-wide">{item.title}</p>
          </Link>
        );
      })}
    </div>
  );
}
