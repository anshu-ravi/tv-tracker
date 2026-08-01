import type { UserStats } from "@/lib/stats";

// A few playful callouts. Renders one friendly empty-state card instead of
// a wall of zeros when the user has essentially no data yet.
export default function FunStats({ stats }: { stats: UserStats }) {
  if (stats.totalEpisodes === 0) {
    return (
      <div className="card-bold p-4">
        <p className="stamp mb-2 inline-block text-[10px]">Fresh start</p>
        <p className="text-sm font-bold">Nothing tracked yet — go watch something!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card-bold p-4">
        <p className="stamp mb-2 inline-block text-[10px]">Fun fact</p>
        <p className="text-sm font-bold">
          You&apos;ve spent {stats.daysOfYourLife.toLocaleString()} day
          {stats.daysOfYourLife === 1 ? "" : "s"} of your life watching this stuff.
        </p>
      </div>

      {stats.longestSeries && (
        <div className="card-bold p-4">
          <p className="stamp mb-2 inline-block text-[10px]">Longest series conquered</p>
          <p className="text-sm font-bold">
            {stats.longestSeries.title} ({stats.longestSeries.episodes} eps)
          </p>
        </div>
      )}

      <div className="card-bold p-4">
        <p className="stamp mb-2 inline-block text-[10px]">Completion rate</p>
        <p className="text-sm font-bold">{stats.completionRate}% of what you start, you finish.</p>
      </div>

      {stats.busiestYear && (
        <div className="card-bold p-4">
          <p className="stamp mb-2 inline-block text-[10px]">Busiest year</p>
          <p className="text-sm font-bold">
            {stats.busiestYear.year} — {stats.busiestYear.episodes} episodes watched.
          </p>
        </div>
      )}
    </div>
  );
}
