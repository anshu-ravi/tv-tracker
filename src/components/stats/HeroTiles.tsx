import type { UserStats } from "@/lib/stats";

// The four headline numbers, in a responsive 2x2 grid of card-bold tiles.
export default function HeroTiles({ stats }: { stats: UserStats }) {
  const tiles = [
    { label: "Episodes", value: stats.totalEpisodes.toLocaleString() },
    {
      label: "Hours",
      value: stats.totalHours.toLocaleString(),
      caption:
        stats.runtimeIsEstimatedForPct > 5
          ? `≈ approximate — ${stats.runtimeIsEstimatedForPct}% of episodes estimated`
          : null,
    },
    { label: "Days", value: stats.totalDays.toLocaleString() },
    { label: "Shows", value: stats.distinctShows.toLocaleString() },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="card-bold p-4">
          <p className="display text-3xl leading-none">{tile.value}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            {tile.label}
          </p>
          {tile.caption && (
            <p className="mt-1 text-[10px] leading-snug text-ink-soft">{tile.caption}</p>
          )}
        </div>
      ))}
    </div>
  );
}
