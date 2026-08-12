import Link from "next/link";
import Image from "next/image";
import type { DataSource, MediaType, WatchStatus } from "@/lib/types";
import CardActionSheet from "@/components/CardActionSheet";
import { tmdbImageLoader } from "@/lib/tmdbImage";

export interface PosterCardTitle {
  id: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  source: DataSource;
  sourceId: string;
  // Whether this title is in the Favorites list. Optional/omittable for
  // callers that don't bother computing it (e.g. a bare tile with no
  // `status`); PosterCard treats it as `false` when absent.
  favorited?: boolean;
  // Whether the provider still lists this title as ongoing (TMDB "Returning
  // Series" / AniList "RELEASING", etc — see titles.is_running). Optional
  // because only the completed-bucket badge below needs it; callers that
  // don't fetch the column just omit it and the badge stays hidden.
  isRunning?: boolean;
}

// A single poster tile for the TV/Anime/Watchlist grids. `muted` dims a DNF
// entry (per the design spec — DNF stays visible but visually de-emphasized,
// never hidden).
//
// `status`, when passed, renders a small "⋯" kebab button in the top-right
// corner of the poster that opens a bottom action sheet (status / add to
// list / favorite) — callers that already know the title's current bucket
// (BucketSection, the Watchlist grid) pass it; omit it to render a bare tile.
export default function PosterCard({
  title,
  muted = false,
  status,
  priority = false,
}: {
  title: PosterCardTitle;
  muted?: boolean;
  status?: WatchStatus;
  // Set by callers for the first row of an above-the-fold grid, so the
  // likely LCP poster skips lazy-loading. Defaults to false — most grid
  // tiles are below the fold and should stay lazy.
  priority?: boolean;
}) {
  return (
    <div className={`card-bold relative p-0 ${muted ? "opacity-60 grayscale-[35%]" : ""}`}>
      <Link href={`/title/${title.id}`}>
        {/* overflow-hidden is scoped to the poster image only (not the whole
            card) so its rounded top corners stay clean. */}
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-[11px] border-b-[3px] border-ink bg-panel">
          {title.posterUrl ? (
            <Image
              src={title.posterUrl}
              alt={title.title}
              fill
              sizes="(max-width: 640px) 33vw, 200px"
              className="object-cover"
              priority={priority}
              loader={tmdbImageLoader}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2 text-center">
              <span className="display text-sm leading-tight text-ink-soft">
                {title.title}
              </span>
            </div>
          )}
          {/* Completed-only badge distinguishing a show that's genuinely
              over ("ENDED") from one the user is merely current on but that
              will get more episodes later ("CAUGHT UP"). Bottom-left,
              opposite corner from the kebab (top-right) so the two never
              collide. Only rendered when the caller both passes `status`
              (i.e. this tile is in a known bucket) and it's "completed" —
              watching/watchlist/dnf tiles never show it. */}
          {status === "completed" && title.isRunning !== undefined && (
            <span
              className={`absolute bottom-1.5 left-1.5 inline-block -rotate-3 border-2 border-ink px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
                title.isRunning ? "bg-acid text-ink" : "bg-ink text-paper"
              }`}
            >
              {title.isRunning ? "Caught up" : "Ended"}
            </span>
          )}
        </div>
        <p className="truncate px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide">
          {title.title}
        </p>
      </Link>
      {/* Sibling of the Link (not nested inside it): CardActionSheet is
          portaled to document.body, which avoids DOM bubbling into the
          Link, but React synthetic events still bubble through the React
          component tree regardless of the portal target. Keeping the sheet
          outside the Link's subtree ensures no click on its trigger or on
          any action inside the sheet can bubble up and trigger navigation.
          The trigger is `absolute right-1.5 top-1.5`, anchored to this now
          `relative` card wrapper — same visual top-right position as before. */}
      {status && (
        <CardActionSheet
          title={title.title}
          source={title.source}
          sourceId={title.sourceId}
          mediaType={title.mediaType}
          titleId={title.id}
          initialStatus={status}
          initialFavorited={title.favorited ?? false}
        />
      )}
    </div>
  );
}
