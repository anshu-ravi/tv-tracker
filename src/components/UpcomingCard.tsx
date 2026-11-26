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

// One Upcoming row: thumb, title, episode + media type, and the air date on the right.
export default function UpcomingCard({ item }: { item: UpcomingItem }) {
  // Acid marks anything airing today or tomorrow, so equally imminent titles look equal.
  const highlight = item.daysUntil <= 1;
  const date = upcomingDateLabel(item.airDate, item.daysUntil);
  const subtitle = [item.episodeLabel ? compactEpisodeCode(item.episodeLabel) : null, MEDIA_TYPE_LABEL[item.mediaType]]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/title/${item.titleId}`} className={rowClass}>
      <span className="relative h-24 w-16 shrink-0 overflow-hidden rounded-md border-2 border-ink bg-panel">
        {item.posterUrl ? (
          <Image
            src={buildTmdbImageUrl(item.posterUrl, 128)}
            alt=""
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold leading-snug">{item.title}</span>
        <span className="block truncate text-[11px] text-ink-soft">{subtitle}</span>
      </span>
      <span
        className={`shrink-0 text-right text-[11px] font-extrabold uppercase leading-tight ${
          highlight ? "border-2 border-ink bg-acid px-1.5 py-0.5" : ""
        }`}
      >
        <span className="block">{date.primary}</span>
        {date.secondary && <span className="block font-semibold normal-case text-ink-soft">{date.secondary}</span>}
      </span>
    </Link>
  );
}
