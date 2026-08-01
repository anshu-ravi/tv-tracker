import type { UserStats } from "@/lib/stats";

// Compact tile row showing counts of tracked titles per status bucket.
export default function StatusDistribution({ stats }: { stats: UserStats }) {
  const { completed, watching, watchlist, dnf } = stats.statusCounts;
  const tiles = [
    { label: "Completed", value: completed },
    { label: "Watching", value: watching },
    { label: "Watchlist", value: watchlist },
    { label: "DNF", value: dnf, muted: true },
  ];

  return (
    <div className="card-bold p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Status</h2>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`border-2 border-ink p-2 text-center ${tile.muted ? "bg-panel" : "bg-paper"}`}
          >
            <p className="display text-lg leading-none">{tile.value}</p>
            <p className="mt-1 text-[9px] font-bold uppercase leading-tight tracking-wide text-ink-soft">
              {tile.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
