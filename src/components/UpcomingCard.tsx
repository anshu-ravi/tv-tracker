import Link from "next/link";
import type { UpcomingItem } from "@/components/HomeTabs";
// (type-only import — no runtime dependency on HomeTabs, so no circularity.)

const MEDIA_TYPE_LABEL: Record<UpcomingItem["mediaType"], string> = {
  tv: "TV",
  anime: "Anime",
  movie: "Movie",
};

function daysUntilLabel(daysUntil: number): string {
  if (daysUntil === 0) return "Airs today";
  if (daysUntil === 1) return "Airs tomorrow";
  return `Airs in ${daysUntil} days`;
}

// Bold-styled card for the Upcoming tab: poster thumb, title, media-type
// stamp, optional episode label, and a prominent "airs in N days" line.
// Purely presentational (no mark-watched interaction) — links through to
// the title detail page like the rest of the app's poster cards.
export default function UpcomingCard({ item }: { item: UpcomingItem }) {
  return (
    <Link href={`/title/${item.titleId}`} className="card-bold flex items-center gap-3 p-3">
      <div className="h-24 w-16 shrink-0 overflow-hidden rounded-md border-[3px] border-ink bg-panel">
        {item.posterUrl ? (
          <img
            src={item.posterUrl}
            alt={item.title}
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="stamp w-fit text-[10px]">{MEDIA_TYPE_LABEL[item.mediaType]}</span>
        <h3 className="display truncate text-lg">{item.title}</h3>
        {item.episodeLabel && (
          <p className="truncate text-xs font-semibold text-ink-soft">{item.episodeLabel}</p>
        )}
        <span
          className={`inline-block w-fit border-[2px] border-ink px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide shadow-[2px_2px_0_0_var(--color-ink)] ${
            item.daysUntil <= 1 ? "bg-acid text-ink" : "bg-panel text-ink"
          }`}
        >
          {daysUntilLabel(item.daysUntil)}
        </span>
      </div>
    </Link>
  );
}
