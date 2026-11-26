import type { UserStats } from "@/lib/stats";
import { AccountGroup } from "@/components/account/AccountList";
import { StripCell } from "@/components/RatingsStrip";

// Largest-remainder rounding: whole-number percentages that sum to round(100 * sum(shares)).
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
  { key: "tv", label: "TV", swatch: "bg-ink" },
  { key: "anime", label: "Anime", swatch: "bg-acid" },
  { key: "movie", label: "Movies", swatch: "bg-dnf" },
] as const;

// Smallest visible width for a non-zero segment, so a 1% share still shows.
const MIN_SEGMENT_PCT = 4;

// Where watch time went, split by hours across TV, anime and movies.
export default function MediaMix({ stats }: { stats: UserStats }) {
  const { tv, anime, movie } = stats.byMediaType;
  const hours = [tv.hours, anime.hours, movie.hours];
  const total = hours.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const pcts = roundSharesToSum100(hours.map((h) => h / total));
  const widths = hours.map((h) => (h > 0 ? Math.max((h / total) * 100, MIN_SEGMENT_PCT) : 0));

  return (
    <AccountGroup label="Where your time went">
      <div className="p-3">
        <div className="flex h-5 w-full divide-x-2 divide-ink overflow-hidden border-2 border-ink">
          {SEGMENTS.map((seg, i) =>
            widths[i] > 0 ? (
              <div key={seg.key} className={seg.swatch} style={{ flexGrow: widths[i], flexBasis: 0 }} />
            ) : null,
          )}
        </div>
      </div>
      <div className="flex divide-x-2 divide-ink">
        {SEGMENTS.map((seg, i) => (
          <StripCell
            key={seg.key}
            label={seg.label}
          >
            <span className={`inline-block h-3 w-3 shrink-0 border-2 border-ink ${seg.swatch}`} />
            {pcts[i]}%
            <span className="text-[11px] font-normal text-ink-soft">
              {Math.round(hours[i]).toLocaleString()}h
            </span>
          </StripCell>
        ))}
      </div>
    </AccountGroup>
  );
}
