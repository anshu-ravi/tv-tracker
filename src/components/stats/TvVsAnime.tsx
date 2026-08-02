import type { UserStats } from "@/lib/stats";

// Two-segment horizontal bar comparing TV vs Anime. The split is computed
// from episode counts (not hours) since episodes are the app's primary
// unit of progress. The legend shows whole-number percentages using
// "largest remainder" rounding: floor both shares, then hand the leftover
// point(s) to whichever side has the larger fractional remainder. This
// guarantees the two percentages always sum to exactly 100 — plain
// independent rounding can produce 49%/50% (or 51%/51%) when the true
// split sits near a half-point.
function roundToSum100(tvShare: number, animeShare: number): { tvPct: number; animePct: number } {
  const rawTv = tvShare * 100;
  const rawAnime = animeShare * 100;
  const floorTv = Math.floor(rawTv);
  const floorAnime = Math.floor(rawAnime);
  const remainder = 100 - floorTv - floorAnime;

  if (remainder <= 0) return { tvPct: floorTv, animePct: floorAnime };

  // Give the leftover point(s) to the side with the larger fractional part.
  const tvRemainder = rawTv - floorTv;
  const animeRemainder = rawAnime - floorAnime;
  if (tvRemainder >= animeRemainder) {
    return { tvPct: floorTv + remainder, animePct: floorAnime };
  }
  return { tvPct: floorTv, animePct: floorAnime + remainder };
}

export default function TvVsAnime({ stats }: { stats: UserStats }) {
  const { tv, anime } = stats.tvVsAnime;
  const total = tv.episodes + anime.episodes;
  const tvShare = total > 0 ? tv.episodes / total : 0;
  const animeShare = total > 0 ? anime.episodes / total : 0;
  const { tvPct, animePct } = total > 0 ? roundToSum100(tvShare, animeShare) : { tvPct: 0, animePct: 0 };

  return (
    <div className="card-bold p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">TV vs Anime</h2>

      {total === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Nothing watched yet.</p>
      ) : (
        <>
          <div className="mt-3 flex h-6 w-full overflow-hidden border-[3px] border-ink">
            <div className="flex items-center justify-center bg-acid" style={{ width: `${tvShare * 100}%` }} />
            <div
              className="flex items-center justify-center bg-panel"
              style={{ width: `${animeShare * 100}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide">
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 border border-ink bg-acid align-middle" />
              TV — {tvPct}%
            </span>
            <span>
              <span className="mr-1 inline-block h-2.5 w-2.5 border border-ink bg-panel align-middle" />
              Anime — {animePct}%
            </span>
          </div>
        </>
      )}
    </div>
  );
}
