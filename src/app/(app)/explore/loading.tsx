import { SkeletonLine } from "@/components/Skeleton";

// Explore's own server work is just "load the caller's library so results
// can be flagged as already-tracked" — ExploreClient (the search box +
// results/rails) is a client component with no server data dependency, so
// there's nothing meaningful to skeleton below the search bar shape itself.
export default function ExploreLoading() {
  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Explore</h1>
      <div className="h-11 w-full animate-pulse rounded-[10px] border-[3px] border-ink bg-panel" />
      <div className="mt-6 flex flex-col gap-3">
        <SkeletonLine className="h-16 w-full" />
        <SkeletonLine className="h-16 w-full" />
        <SkeletonLine className="h-16 w-full" />
      </div>
    </div>
  );
}
