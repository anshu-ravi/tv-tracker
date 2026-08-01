import Link from "next/link";
import type { WatchingCardData } from "@/components/WatchingCard";

// UTC-midnight timestamp for an ISO (YYYY-MM-DD) date, avoiding local
// timezone off-by-ones — same approach as utcMidnight in the Home page.
function utcMidnight(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

// Whole-months/weeks-behind label for a show's next-unwatched episode air
// date. Mirrors the day math in the Home page (utcMidnight/daysBetween) but
// works from an already-computed day count since that's all this component
// receives.
function behindLabel(daysSinceAired: number): string {
  const months = Math.floor(daysSinceAired / 30);
  if (months >= 1) return `${months} MONTH${months === 1 ? "" : "S"} BEHIND`;
  const weeks = Math.max(1, Math.floor(daysSinceAired / 7));
  return `${weeks} WEEK${weeks === 1 ? "" : "S"} BEHIND`;
}

// Horizontally-scrolling "get back into this" shortcut for shows the user
// has fallen well behind on (see CATCHUP_THRESHOLD_DAYS in the Home page).
// Deliberately has no mark-watched control — tapping just opens the title so
// the user can catch up properly rather than one-tapping through a backlog.
export default function CatchUpCarousel({ items }: { items: WatchingCardData[] }) {
  const today = new Date().toISOString().slice(0, 10);

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
          // air_date is always <= today for a card that reached the catch-up
          // bucket (see the Home page's classification), so this is never
          // negative in practice; guard anyway rather than showing a
          // nonsensical negative "weeks behind".
          const daysSinceAired = card.nextEpisodeAirDate
            ? Math.max(0, Math.round((utcMidnight(today) - utcMidnight(card.nextEpisodeAirDate)) / 86_400_000))
            : 0;

          return (
            <Link
              key={card.titleId}
              href={`/title/${card.titleId}`}
              className="card-bold flex w-40 shrink-0 snap-start flex-col gap-1.5 p-2.5"
            >
              <div className="h-40 w-full overflow-hidden rounded-md border-[3px] border-ink bg-panel">
                {card.posterUrl ? (
                  <img
                    src={card.posterUrl}
                    alt={card.title}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <h3 className="display truncate text-sm">{card.title}</h3>
              {card.nextEpisodeCode && (
                <span className="text-xs font-semibold text-ink-soft">{card.nextEpisodeCode}</span>
              )}
              <span className="stamp w-fit text-[9px]">{behindLabel(daysSinceAired)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
