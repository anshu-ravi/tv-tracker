import type { UserStats } from "@/lib/stats";

// Vertical bar chart of episodes watched per year, scaled to the busiest
// year. Horizontally scrollable so a long year range never overflows the
// max-w-md shell.
export default function ByYear({ stats }: { stats: UserStats }) {
  const { perYear, distinctWatchDays, bulkImportNote } = stats;
  const maxEpisodes = perYear.length > 0 ? Math.max(...perYear.map((y) => y.episodes), 1) : 1;

  return (
    <div className="card-bold p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">By Year</h2>
        <p className="text-[11px] font-bold text-ink-soft">
          {distinctWatchDays.toLocaleString()} days logged
        </p>
      </div>

      {perYear.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No dated watch history yet.</p>
      ) : (
        <>
          <div className="mt-4 flex items-end gap-2 overflow-x-auto pb-1">
            {perYear.map((y) => {
              const heightPct = Math.max((y.episodes / maxEpisodes) * 100, 4);
              return (
                <div key={y.year} className="flex shrink-0 flex-col items-center gap-1">
                  <div className="flex h-24 w-8 items-end border-2 border-ink bg-panel">
                    <div
                      className="w-full bg-acid"
                      style={{ height: `${heightPct}%` }}
                      title={`${y.episodes} episodes`}
                    />
                  </div>
                  <p className="text-[10px] font-bold">{y.year}</p>
                  <p className="text-[9px] text-ink-soft">{y.episodes}</p>
                </div>
              );
            })}
          </div>
          {bulkImportNote && (
            <p className="mt-3 text-[10px] leading-snug text-ink-soft">
              Much of this history was imported/back-marked in bulk, so the timeline reflects
              when shows were logged, not necessarily watched.
            </p>
          )}
        </>
      )}
    </div>
  );
}
