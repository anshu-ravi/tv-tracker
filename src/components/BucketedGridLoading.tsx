import { SkeletonLine, SkeletonPosterGrid } from "@/components/Skeleton";

// Shared route-level fallback for the TV and Anime library sections — both
// render via BucketedGridPage (heading + four status-bucketed 3-col poster
// grids: Watching/Watchlist/Completed/DNF). Only the "Watching" section
// (first, and the one most likely above the fold) gets a full placeholder
// grid; a second, shorter one hints that more sections follow below.
export default function BucketedGridLoading({ heading }: { heading: string }) {
  return (
    <div className="pb-6">
      <h1 className="display px-4 pt-4 text-2xl">{heading}</h1>

      <section className="px-4 py-4">
        <div className="mb-3 flex items-baseline gap-2">
          <SkeletonLine className="h-5 w-24" />
        </div>
        <SkeletonPosterGrid count={6} />
      </section>

      <section className="px-4 py-4">
        <div className="mb-3 flex items-baseline gap-2">
          <SkeletonLine className="h-5 w-24" />
        </div>
        <SkeletonPosterGrid count={3} />
      </section>
    </div>
  );
}
