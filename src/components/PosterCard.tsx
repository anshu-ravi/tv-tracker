import Link from "next/link";
import type { DataSource, MediaType, WatchStatus } from "@/lib/types";
import TitleActionBar from "@/components/TitleActionBar";

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
}

// A single poster tile for the TV/Anime/Watchlist grids. `muted` dims a DNF
// entry (per the design spec — DNF stays visible but visually de-emphasized,
// never hidden). Plain <img>, not next/image: no remote-image domains are
// configured and this component can't touch next.config.ts.
//
// `status`, when passed, renders the compact icon action bar (status / add
// to list / favorite) below the poster — callers that already know the
// title's current bucket (BucketSection, the Watchlist grid) pass it; omit
// it to render a bare tile.
export default function PosterCard({
  title,
  muted = false,
  status,
}: {
  title: PosterCardTitle;
  muted?: boolean;
  status?: WatchStatus;
}) {
  return (
    <div className={`card-bold p-0 ${muted ? "opacity-60 grayscale-[35%]" : ""}`}>
      <Link href={`/title/${title.id}`}>
        {/* overflow-hidden is scoped to the poster image only (not the whole
            card) so the compact action bar's popovers below can escape the
            card's bounds instead of being clipped — see TitleActionBar's
            `compact` variant. */}
        <div className="aspect-[2/3] w-full overflow-hidden rounded-t-[11px] border-b-[3px] border-ink bg-panel">
          {title.posterUrl ? (
            <img
              src={title.posterUrl}
              alt={title.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2 text-center">
              <span className="display text-sm leading-tight text-ink-soft">
                {title.title}
              </span>
            </div>
          )}
        </div>
        <p className="truncate px-1.5 py-1 text-[10px] font-bold uppercase tracking-wide">
          {title.title}
        </p>
      </Link>
      {status && (
        <div className="px-1.5 pb-1.5">
          <TitleActionBar
            variant="compact"
            source={title.source}
            sourceId={title.sourceId}
            mediaType={title.mediaType}
            titleId={title.id}
            initialStatus={status}
            initialFavorited={title.favorited ?? false}
          />
        </div>
      )}
    </div>
  );
}
