import type { TitleRatings } from "@/lib/types";

// One row of facts about a title: external scores, where to watch, and the owner's own rating.
export function StripCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-2.5 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
      <span className="flex min-h-[22px] items-center gap-1 text-sm font-bold">{children}</span>
    </div>
  );
}

export default function RatingsStrip({
  ratings,
  children,
}: {
  ratings: TitleRatings;
  children?: React.ReactNode;
}) {
  const { imdb, rottenTomatoes } = ratings;
  return (
    <div className="mx-4 mt-4 flex divide-x-2 divide-ink border-2 border-ink bg-paper">
      {imdb !== null && <StripCell label="IMDb">{imdb.toFixed(1)}</StripCell>}
      {rottenTomatoes !== null && <StripCell label="Tomatometer">🍅 {rottenTomatoes}%</StripCell>}
      {children}
    </div>
  );
}
