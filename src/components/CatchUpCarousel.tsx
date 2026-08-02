import Link from "next/link";
import Image from "next/image";
import type { WatchingCardData } from "@/components/WatchingCard";

// Horizontally-scrolling "get back into this" shortcut for shows the user
// has fallen well behind on (see CATCHUP_THRESHOLD_DAYS in the Home page).
// Deliberately has no mark-watched control — tapping just opens the title so
// the user can catch up properly rather than one-tapping through a backlog.
export default function CatchUpCarousel({ items }: { items: WatchingCardData[] }) {
  return (
    // `-mx-4 px-4` extends the scroll container to the screen edges (matching
    // the page's own px-4 gutter) while still padding its content so the
    // hard offset shadows on each card aren't clipped by the container edge —
    // the same bleed issue noted elsewhere for horizontal scrollers on this
    // page (body has overflow-x-hidden, so the scrolling must stay contained
    // here rather than pushing the page wider).
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex w-max snap-x snap-mandatory gap-3">
        {items.map((card) => {
          return (
            <Link
              key={card.titleId}
              href={`/title/${card.titleId}`}
              className="card-bold flex w-40 shrink-0 snap-start flex-col gap-1.5 p-2.5"
            >
              <div className="relative h-40 w-full overflow-hidden rounded-md border-[3px] border-ink bg-panel">
                {card.posterUrl ? (
                  <Image
                    src={card.posterUrl}
                    alt={card.title}
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                ) : null}
              </div>
              <h3 className="display truncate text-sm">{card.title}</h3>
              {card.nextEpisodeCode && (
                <span className="text-xs font-semibold text-ink-soft">{card.nextEpisodeCode}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
