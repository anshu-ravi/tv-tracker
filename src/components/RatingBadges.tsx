import type { TitleRatings } from "@/lib/types";

// Small hard-bordered rating chips for the title detail screen. Server-safe
// (no client state) — plain presentational rendering of already-fetched
// TitleRatings. Renders nothing when every value is null (e.g. no OMDb key
// or no IMDb match).

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 border-[2.5px] border-ink bg-panel px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-[2px_2px_0_0_var(--color-ink)]">
      {children}
    </span>
  );
}

export default function RatingBadges({ ratings }: { ratings: TitleRatings }) {
  const { imdb, rottenTomatoes } = ratings;
  if (imdb === null && rottenTomatoes === null) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {imdb !== null && (
        <Badge>
          <span className="text-ink-soft">IMDb</span>
          <span>{imdb.toFixed(1)}</span>
        </Badge>
      )}
      {rottenTomatoes !== null && (
        <Badge>
          <span>🍅 {rottenTomatoes}%</span>
        </Badge>
      )}
    </div>
  );
}
