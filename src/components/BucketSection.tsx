import PosterCard, { type PosterCardTitle } from "@/components/PosterCard";
import type { WatchStatus } from "@/lib/types";

// One labelled section of a bucketed poster grid (Watching / Watchlist /
// Completed / DNF). A per-title detail screen is out of scope for this pass,
// so posters are static tiles for now; the pill communicates count at a glance.
export default function BucketSection({
  label,
  status,
  titles,
  isFirstSection = false,
}: {
  label: string;
  status: WatchStatus;
  titles: PosterCardTitle[];
  // True only for the first non-empty bucket section on the page — that
  // section's opening row is the one actually above the fold. Sections
  // further down (even though each starts its own 3-col grid) are not, so
  // this must come from the page, not from `titles.length > 0` here.
  isFirstSection?: boolean;
}) {
  const muted = status === "dnf";

  return (
    <section className="px-4 py-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="display text-xl">{label}</h2>
        <span className="stamp text-[10px]">{titles.length}</span>
      </div>

      {titles.length === 0 ? (
        <p className="card-bold px-4 py-6 text-center text-sm text-ink-soft">
          Nothing here yet.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {titles.map((title, index) => (
            <PosterCard
              key={title.id}
              title={title}
              muted={muted}
              status={status}
              priority={isFirstSection && index < 3}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// Re-exported so page components building the four-status grouping share one
// canonical list/order (Watching, Watchlist, Completed, DNF).
export const BUCKET_ORDER: { status: WatchStatus; label: string }[] = [
  { status: "watching", label: "Watching" },
  { status: "watchlist", label: "Watchlist" },
  { status: "completed", label: "Completed" },
  { status: "dnf", label: "DNF" },
];
