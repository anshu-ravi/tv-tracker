import type { UserStats } from "@/lib/stats";

// Episodes watched per year, scaled to the busiest year (the one acid bar).
export default function ByYear({ stats }: { stats: UserStats }) {
  const { perYear, bulkImportNote, busiestYear } = stats;
  if (perYear.length === 0) {
    return <p className="text-sm text-ink-soft">No dated watch history yet.</p>;
  }
  const maxEpisodes = Math.max(...perYear.map((y) => y.episodes), 1);

  return (
    <>
      <div className="flex items-end gap-2 overflow-x-auto pb-1">
        {perYear.map((y) => (
          <div key={y.year} className="flex shrink-0 flex-col items-center gap-1">
            <div className="flex h-28 w-9 items-end border-b-2 border-ink">
              <div
                className={`w-full border-2 border-b-0 border-ink ${y.year === busiestYear?.year ? "bg-acid" : "bg-ink"}`}
                style={{ height: `${Math.max((y.episodes / maxEpisodes) * 100, 3)}%` }}
              />
            </div>
            <p className="text-[11px] font-bold">{y.year}</p>
            <p className="text-[10px] text-ink-soft">{y.episodes.toLocaleString()}</p>
          </div>
        ))}
      </div>
      {bulkImportNote && (
        <p className="mt-3 text-[11px] leading-snug text-ink-soft">
          Much of this history was imported in bulk, so years show when shows were logged, not necessarily watched.
        </p>
      )}
    </>
  );
}
