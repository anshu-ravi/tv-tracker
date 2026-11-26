import Link from "next/link";
import Image from "next/image";
import type { UpcomingItem } from "@/components/HomeTabs";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";
import { compactEpisodeCode, upcomingDateLabel } from "@/lib/upcomingDate";
import { rowClass } from "@/components/account/AccountList";

const MEDIA_TYPE_LABEL: Record<UpcomingItem["mediaType"], string> = {
  tv: "TV",
  anime: "Anime",
  movie: "Movie",
};

function subtitle(item: UpcomingItem): string {
  return [item.episodeLabel ? compactEpisodeCode(item.episodeLabel) : null, MEDIA_TYPE_LABEL[item.mediaType]]
    .filter(Boolean)
    .join(" · ");
}

// Acid marks anything airing today or tomorrow, so equally imminent titles look equal.
function isImminent(item: UpcomingItem): boolean {
  return item.daysUntil <= 1;
}

function Poster({ item, width, sizes }: { item: UpcomingItem; width: number; sizes: string }) {
  return item.posterUrl ? (
    <Image
      src={buildTmdbImageUrl(item.posterUrl, width)}
      alt=""
      fill
      sizes={sizes}
      className="object-cover"
      unoptimized
    />
  ) : null;
}

// This-week carousel tile: large poster with the air date stamped on it, title and episode below.
export function UpcomingTile({ item }: { item: UpcomingItem }) {
  const date = upcomingDateLabel(item.airDate, item.daysUntil);
  const stamp = [date.primary, date.secondary].filter(Boolean).join(" ");

  return (
    <Link href={`/title/${item.titleId}`} className="flex w-40 shrink-0 snap-start flex-col gap-1">
      <span className="relative aspect-[2/3] w-full overflow-hidden rounded-md border-2 border-ink bg-panel">
        <Poster item={item} width={320} sizes="160px" />
        <span
          className={`absolute left-1.5 top-1.5 border-2 border-ink px-1.5 py-0.5 text-[10px] font-extrabold uppercase leading-none ${
            isImminent(item) ? "bg-acid" : "bg-paper"
          }`}
        >
          {stamp}
        </span>
      </span>
      <span className="text-sm font-bold leading-snug">{item.title}</span>
      <span className="truncate text-[11px] text-ink-soft">{subtitle(item)}</span>
    </Link>
  );
}

// Later row: compact poster, title, episode + media type, and the air date on the right.
export default function UpcomingCard({ item }: { item: UpcomingItem }) {
  const date = upcomingDateLabel(item.airDate, item.daysUntil);

  return (
    <Link href={`/title/${item.titleId}`} className={`${rowClass} py-2.5`}>
      <span className="relative h-[72px] w-12 shrink-0 overflow-hidden rounded-md border-2 border-ink bg-panel">
        <Poster item={item} width={96} sizes="48px" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-snug">{item.title}</span>
        <span className="block truncate text-[11px] text-ink-soft">{subtitle(item)}</span>
      </span>
      <span
        className={`shrink-0 text-right text-[11px] font-extrabold uppercase leading-tight ${
          isImminent(item) ? "border-2 border-ink bg-acid px-1.5 py-0.5" : ""
        }`}
      >
        <span className="block">{date.primary}</span>
        {date.secondary && <span className="block font-semibold normal-case text-ink-soft">{date.secondary}</span>}
      </span>
    </Link>
  );
}
