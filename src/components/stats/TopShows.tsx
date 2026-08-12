import Image from "next/image";
import type { UserStats } from "@/lib/stats";
import { tmdbImageLoader } from "@/lib/tmdbImage";

// Up to 10 rows, each a horizontal bar sized relative to the max hours in
// the list, with a small poster thumb, title, hours, and episode count.
export default function TopShows({ stats }: { stats: UserStats }) {
  const shows = stats.topShowsByHours;
  const maxHours = shows.length > 0 ? Math.max(...shows.map((s) => s.hours), 1) : 1;

  return (
    <div className="card-bold p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Top Shows by Time</h2>

      {shows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No watch history yet.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {shows.map((show) => {
            const widthPct = Math.max((show.hours / maxHours) * 100, 4);
            return (
              <div key={show.titleId} className="flex items-center gap-2">
                <div className="relative h-9 w-9 shrink-0 overflow-hidden border-2 border-ink bg-panel">
                  {show.posterUrl ? (
                    <Image
                      src={show.posterUrl}
                      alt={show.title}
                      fill
                      sizes="36px"
                      className="object-cover"
                      loader={tmdbImageLoader}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <span className="text-[8px] font-bold uppercase leading-none text-ink-soft">
                        {show.title.slice(0, 2)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate text-[11px] font-bold uppercase tracking-wide">
                    {show.title}
                  </p>
                  <div className="mt-0.5 h-3 w-full overflow-hidden border border-ink bg-panel">
                    <div className="h-full bg-acid" style={{ width: `${widthPct}%` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] font-bold">
                  <p>{show.hours}h</p>
                  <p className="text-[10px] font-normal text-ink-soft">{show.episodes} ep</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
