import type { UserStats } from "@/lib/stats";

// Headline totals: hours (the one acid fact) with days beneath, then episodes and shows.
export default function HeroStrip({ stats }: { stats: UserStats }) {
  const estimated = stats.runtimeIsEstimatedForPct > 5;
  const days = Math.round(stats.totalDays).toLocaleString();

  return (
    <>
      <div className="flex divide-x-2 divide-ink border-2 border-ink bg-paper">
        <div className="flex min-w-0 flex-[1.4] flex-col gap-1 bg-acid px-3 py-2.5">
          <span className="display text-3xl leading-none">
            {estimated && "≈"}
            {stats.totalHours.toLocaleString()}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide">Hours · {days} days</span>
        </div>
        <Cell label="Episodes" value={stats.totalEpisodes} />
        <Cell label="Shows" value={stats.distinctShows} />
      </div>
      {estimated && (
        <p className="mt-1.5 text-[11px] text-ink-soft">
          ≈ {stats.runtimeIsEstimatedForPct}% of episodes have an estimated runtime.
        </p>
      )}
    </>
  );
}

function Cell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-end gap-1 px-3 py-2.5">
      <span className="display text-xl leading-none">{value.toLocaleString()}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
    </div>
  );
}
