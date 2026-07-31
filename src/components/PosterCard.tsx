import type { MediaType } from "@/lib/types";

export interface PosterCardTitle {
  id: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
}

// A single poster tile for the TV/Anime/Watchlist grids. `muted` dims a DNF
// entry (per the design spec — DNF stays visible but visually de-emphasized,
// never hidden). Plain <img>, not next/image: no remote-image domains are
// configured and this component can't touch next.config.ts.
export default function PosterCard({
  title,
  muted = false,
}: {
  title: PosterCardTitle;
  muted?: boolean;
}) {
  return (
    <div
      className={`card-bold overflow-hidden p-0 ${muted ? "opacity-60 grayscale-[35%]" : ""}`}
    >
      <div className="aspect-[2/3] w-full border-b-[3px] border-ink bg-panel">
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
      <p className="truncate px-2 py-1.5 text-xs font-bold uppercase tracking-wide">
        {title.title}
      </p>
    </div>
  );
}
