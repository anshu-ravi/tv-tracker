import Image from "next/image";
import type { RatedTitleStat, UserStats } from "@/lib/stats";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";

// Poster thumb + title + rating, shared by the Highest/Lowest Rated lists.
function RatedRow({ item }: { item: RatedTitleStat }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-9 w-9 shrink-0 overflow-hidden border-2 border-ink bg-panel">
        {item.posterUrl ? (
          <Image
            src={buildTmdbImageUrl(item.posterUrl, 72)}
            alt={item.title}
            fill
            sizes="36px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-[8px] font-bold uppercase leading-none text-ink-soft">
              {item.title.slice(0, 2)}
            </span>
          </div>
        )}
      </div>
      <p className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide">{item.title}</p>
      <p className="shrink-0 text-[11px] font-bold">{item.rating.toFixed(1)}★</p>
    </div>
  );
}

// Ratings summary: hero numbers, a half-star histogram, per-media-type
// averages, and the top/bottom 5 rated titles.
export default function Ratings({ stats }: { stats: UserStats }) {
  if (stats.ratingsCount === 0) {
    return (
      <div className="card-bold p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Ratings</h2>
        <p className="mt-3 text-sm text-ink-soft">Nothing rated yet.</p>
      </div>
    );
  }

  const { averageRatingByMediaType: byType } = stats;
  const maxBucketCount = Math.max(...stats.ratingDistribution.map((b) => b.count), 1);

  return (
    <div className="space-y-4">
      <div className="card-bold p-4">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Ratings</h2>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="border-2 border-ink bg-paper p-2 text-center">
            <p className="display text-lg leading-none">{stats.averageRating?.toFixed(1) ?? "—"}</p>
            <p className="mt-1 text-[9px] font-bold uppercase leading-tight tracking-wide text-ink-soft">
              Avg Rating
            </p>
          </div>
          <div className="border-2 border-ink bg-paper p-2 text-center">
            <p className="display text-lg leading-none">{stats.ratingsCount}</p>
            <p className="mt-1 text-[9px] font-bold uppercase leading-tight tracking-wide text-ink-soft">
              Rated
            </p>
          </div>
          <div className="border-2 border-ink bg-paper p-2 text-center">
            <p className="display text-lg leading-none">{stats.ratedPct}%</p>
            <p className="mt-1 text-[9px] font-bold uppercase leading-tight tracking-wide text-ink-soft">
              Of Started
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-end gap-1">
          {stats.ratingDistribution.map((b) => {
            const heightPct = b.count > 0 ? Math.max((b.count / maxBucketCount) * 100, 6) : 2;
            return (
              <div key={b.bucket} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-16 w-full items-end border border-ink bg-panel">
                  <div
                    className="w-full bg-acid"
                    style={{ height: `${heightPct}%` }}
                    title={`${b.count} rated ${b.bucket}★`}
                  />
                </div>
                <p className="text-[8px] font-bold text-ink-soft">{b.bucket}</p>
              </div>
            );
          })}
        </div>

        {(byType.tv != null || byType.anime != null || byType.movie != null) && (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t-2 border-ink pt-3 text-center">
            <div>
              <p className="text-sm font-bold">{byType.tv?.toFixed(1) ?? "—"}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">TV</p>
            </div>
            <div>
              <p className="text-sm font-bold">{byType.anime?.toFixed(1) ?? "—"}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">Anime</p>
            </div>
            <div>
              <p className="text-sm font-bold">{byType.movie?.toFixed(1) ?? "—"}</p>
              <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">Movies</p>
            </div>
          </div>
        )}
      </div>

      {stats.highestRated.length > 0 && (
        <div className="card-bold p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Highest Rated</h2>
          <div className="mt-3 space-y-2.5">
            {stats.highestRated.map((item) => (
              <RatedRow key={item.titleId} item={item} />
            ))}
          </div>
        </div>
      )}

      {stats.lowestRated.length > 0 && (
        <div className="card-bold p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Lowest Rated</h2>
          <div className="mt-3 space-y-2.5">
            {stats.lowestRated.map((item) => (
              <RatedRow key={item.titleId} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
