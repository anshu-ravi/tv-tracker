import Link from "next/link";
import Image from "next/image";
import type { RankedTitle } from "@/lib/ratingsRank";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";

// Swipeable row of big poster cards, each with its rank and a rating stamp.
export default function RankedCarousel({ titles }: { titles: RankedTitle[] }) {
  return (
    <div
      className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 pt-1"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {titles.map((item, i) => (
        <Link
          key={item.titleId}
          href={`/title/${item.titleId}`}
          className="w-[42vw] max-w-[168px] shrink-0 snap-start transition-transform active:translate-x-[2px] active:translate-y-[2px]"
        >
          <div className="card-bold relative overflow-hidden p-0">
            <div className="relative aspect-[2/3] w-full bg-panel">
              {item.posterUrl ? (
                <Image
                  src={buildTmdbImageUrl(item.posterUrl, 342)}
                  alt={item.title}
                  fill
                  sizes="168px"
                  className="object-cover"
                  priority={i < 2}
                  unoptimized
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center p-2 text-center">
                  <span className="display text-lg text-ink-soft">{item.title}</span>
                </div>
              )}
            </div>
            <span className="display absolute left-0 top-0 border-b-[3px] border-r-[3px] border-ink bg-ink px-2 py-1 text-2xl text-paper">
              #{item.rank}
            </span>
            <span className="stamp absolute bottom-2 right-2 text-base">{item.rating.toFixed(1)}★</span>
          </div>
          <p className="mt-2 truncate text-[11px] font-bold uppercase tracking-wide">{item.title}</p>
        </Link>
      ))}
    </div>
  );
}
