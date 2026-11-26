import { createClient } from "@/lib/supabase/server";
import { getRatedTitles, getUserStats } from "@/lib/stats";
import { rankRatings } from "@/lib/ratingsRank";
import BackButton from "@/components/BackButton";
import { AccountGroup, AccountRow } from "@/components/account/AccountList";
import { SearchIcon } from "@/components/icons";
import HeroStrip from "@/components/stats/HeroStrip";
import MediaMix from "@/components/stats/MediaMix";
import StatusDistribution from "@/components/stats/StatusDistribution";
import Ratings from "@/components/stats/Ratings";
import ActivityRow from "@/components/stats/ActivityRow";
import ByYear from "@/components/stats/ByYear";

export default async function StatsPage() {
  const supabase = await createClient();
  const [stats, rated] = await Promise.all([getUserStats(supabase), getRatedTitles(supabase)]);
  const topRated = rankRatings(rated, "all", "desc").slice(0, 3);

  const activitySubtitle =
    stats.perYear.length === 0
      ? "No dated history yet"
      : [
          `${stats.distinctWatchDays.toLocaleString()} days logged`,
          stats.busiestYear && `busiest ${stats.busiestYear.year}`,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account" />
      <h1 className="display mb-4 mt-4 text-3xl">Your Stats</h1>

      {stats.totalEpisodes === 0 ? (
        <AccountGroup label="Nothing tracked yet">
          <AccountRow
            href="/explore"
            icon={<SearchIcon className="h-5 w-5" />}
            title="Find something to watch"
            subtitle="Stats fill in as you mark episodes"
          />
        </AccountGroup>
      ) : (
        <>
          <HeroStrip stats={stats} />
          <MediaMix stats={stats} />
          <StatusDistribution stats={stats} />
          <Ratings stats={stats} topRated={topRated} />
          <AccountGroup label="History">
            <ActivityRow subtitle={activitySubtitle}>
              <ByYear stats={stats} />
            </ActivityRow>
          </AccountGroup>
        </>
      )}
    </div>
  );
}
