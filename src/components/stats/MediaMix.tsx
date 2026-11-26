import type { UserStats } from "@/lib/stats";

// Three-segment horizontal bar comparing TV / Anime / Movies. The split is
// computed from episode counts (movies count as 1 "episode" each, via the
// synthetic per-movie row -- see byMediaType.movie.count) since episodes are
// the app's primary unit of progress. The legend shows whole-number
// percentages using "largest remainder" rounding: floor every share, then
// hand the leftover point(s) to whichever share(s) have the largest
// fractional remainder, in that order. Sums to round(100 * sum(shares)) --
// 100 for the well-formed case of shares that sum to 1, and 0 for an
// all-zero input -- rather than assuming the input always sums to 1.
export function roundSharesToSum100(shares: number[]): number[] {
  const raw = shares.map((s) => s * 100);
  const floors = raw.map((r) => Math.floor(r));
  const target = Math.round(raw.reduce((a, b) => a + b, 0));
  const remainder = target - floors.reduce((a, b) => a + b, 0);

  if (remainder <= 0) return floors;

  const byRemainder = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < Math.min(remainder, byRemainder.length); k++) {
    result[byRemainder[k].i] += 1;
  }
  return result;
}

const SEGMENTS = [
  { key: "tv", label: "TV", swatch: "bg-acid" },
  { key: "anime", label: "Anime", swatch: "bg-panel" },
  { key: "movie", label: "Movies", swatch: "bg-dnf" },
] as const;

export default function TvVsAnime({ stats }: { stats: UserStats }) {
  const { tv, anime, movie } = stats.byMediaType;
  const counts = [tv.episodes, anime.episodes, movie.count];
  const total = counts.reduce((a, b) => a + b, 0);
  const shares = total > 0 ? counts.map((c) => c / total) : [0, 0, 0];
  const pcts = total > 0 ? roundSharesToSum100(shares) : [0, 0, 0];

  return (
    <div className="card-bold p-4">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">TV vs Anime vs Movies</h2>

      {total === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Nothing watched yet.</p>
      ) : (
        <>
          <div className="mt-3 flex h-6 w-full overflow-hidden border-[3px] border-ink">
            {SEGMENTS.map((seg, i) => (
              <div key={seg.key} className={seg.swatch} style={{ width: `${shares[i] * 100}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] font-bold uppercase tracking-wide">
            {SEGMENTS.map((seg, i) => (
              <span key={seg.key}>
                <span className={`mr-1 inline-block h-2.5 w-2.5 border border-ink ${seg.swatch} align-middle`} />
                {seg.label} — {pcts[i]}%
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
