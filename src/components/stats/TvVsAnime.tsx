import type { UserStats } from "@/lib/stats";

// Two-segment horizontal bar comparing TV vs Anime by episode count.
export default function TvVsAnime({ stats }: { stats: UserStats }) {
  const { tv, anime } = stats.tvVsAnime;
  const total = tv.episodes + anime.episodes;
  const tvPct = total > 0 ? (tv.episodes / total) * 100 : 0;
  const animePct = total > 0 ? (anime.episodes / total) * 100 : 0;

  return (
    <div className="card-bold p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">TV vs Anime</h2>

      {total === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Nothing watched yet.</p>
      ) : (
        <>
          <div className="mt-3 flex h-6 w-full overflow-hidden border-[3px] border-ink">
            <div className="flex items-center justify-center bg-acid" style={{ width: `${tvPct}%` }} />
            <div
              className="flex items-center justify-center bg-panel"
              style={{ width: `${animePct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 border border-ink bg-acid align-middle" />
              TV — {tv.episodes} ep · {tv.hours}h
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 border border-ink bg-panel align-middle" />
              Anime — {anime.episodes} ep · {anime.hours}h
            </span>
          </div>
        </>
      )}
    </div>
  );
}
