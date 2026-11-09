import { createClient } from "@/lib/supabase/server";
import { getRatedTitles, getUserStats } from "@/lib/stats";
import { rankRatings } from "@/lib/ratingsRank";
import BackButton from "@/components/BackButton";
import HeroTiles from "@/components/stats/HeroTiles";
import TvVsAnime from "@/components/stats/TvVsAnime";
import TopShows from "@/components/stats/TopShows";
import ByYear from "@/components/stats/ByYear";
import StatusDistribution from "@/components/stats/StatusDistribution";
import FunStats from "@/components/stats/FunStats";
import Ratings from "@/components/stats/Ratings";

export default async function StatsPage() {
  const supabase = await createClient();
  const [stats, rated] = await Promise.all([getUserStats(supabase), getRatedTitles(supabase)]);
  const topRated = rankRatings(rated, "all", "desc").slice(0, 10);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <div className="flex items-center gap-2">
        <BackButton />
      </div>

      <h1 className="display mb-4 mt-4 text-3xl">Your Stats</h1>

      <div className="space-y-4">
        <HeroTiles stats={stats} />
        <TvVsAnime stats={stats} />
        <TopShows stats={stats} />
        <ByYear stats={stats} />
        <StatusDistribution stats={stats} />
        <Ratings stats={stats} topRated={topRated} />
        <FunStats stats={stats} />
      </div>
    </div>
  );
}
