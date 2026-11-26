import type { UserStats } from "@/lib/stats";
import type { RankedTitle } from "@/lib/ratingsRank";
import { AccountGroup, AccountRow } from "@/components/account/AccountList";
import { StripCell } from "@/components/RatingsStrip";
import { StarIcon } from "@/components/icons";

// Ratings summary: headline numbers, a half-star histogram, per-type averages and a link to the full ranking.
export default function Ratings({ stats, topRated }: { stats: UserStats; topRated: RankedTitle[] }) {
  if (stats.ratingsCount === 0) {
    return (
      <AccountGroup label="Ratings">
        <p className="px-3 py-3 text-sm text-ink-soft">Nothing rated yet.</p>
      </AccountGroup>
    );
  }

  const { averageRatingByMediaType: byType } = stats;
  const maxBucketCount = Math.max(...stats.ratingDistribution.map((b) => b.count), 1);
  const typeLine = [
    ["TV", byType.tv],
    ["Anime", byType.anime],
    ["Movies", byType.movie],
  ]
    .filter(([, avg]) => avg != null)
    .map(([label, avg]) => `${label} ${(avg as number).toFixed(1)}`)
    .join(" · ");

  return (
    <AccountGroup label="Ratings">
      <div className="flex divide-x-2 divide-ink">
        <StripCell label="Average">{stats.averageRating?.toFixed(1) ?? "—"}★</StripCell>
        <StripCell label="Rated">{stats.ratingsCount.toLocaleString()}</StripCell>
        <StripCell label="Of started">{stats.ratedPct}%</StripCell>
      </div>

      <div className="px-3 pb-2.5 pt-3">
        <div className="flex h-14 items-end gap-1 border-b-2 border-ink">
          {stats.ratingDistribution.map((b) => (
            <div
              key={b.bucket}
              className="flex-1 bg-ink"
              style={{ height: b.count > 0 ? `${Math.max((b.count / maxBucketCount) * 100, 6)}%` : 0 }}
              title={`${b.count} rated ${b.bucket}★`}
            />
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {stats.ratingDistribution.map((b) => (
            <span key={b.bucket} className="flex-1 text-center text-[9px] font-bold text-ink-soft">
              {b.bucket}
            </span>
          ))}
        </div>
        {typeLine && <p className="mt-2 text-[11px] text-ink-soft">Average by type: {typeLine}</p>}
      </div>

      {topRated.length > 0 && (
        <AccountRow
          href="/account/ratings"
          icon={<StarIcon className="h-5 w-5" />}
          title="Top rated"
          subtitle={topRated.map((t) => `${t.title} ${t.rating.toFixed(1)}`).join(" · ")}
        />
      )}
    </AccountGroup>
  );
}
