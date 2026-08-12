import { SkeletonCarouselCard, SkeletonLine } from "@/components/Skeleton";

// Matches WatchlistPage's layout: heading + two horizontally-swipeable
// carousels (TV, Anime), each ~2.2 cards wide on screen.
export default function WatchlistLoading() {
  return (
    <div className="pb-6">
      <h1 className="display mb-2 px-4 pt-4 text-2xl">Watchlist</h1>

      {[0, 1].map((section) => (
        <section key={section} className="py-4">
          <div className="mb-3 px-4">
            <SkeletonLine className="h-5 w-16" />
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
            <SkeletonCarouselCard />
            <SkeletonCarouselCard />
            <SkeletonCarouselCard />
          </div>
        </section>
      ))}
    </div>
  );
}
