import { SkeletonLine, SkeletonWatchingCard } from "@/components/Skeleton";

// Home's route-level fallback. The shared app shell (header + BottomNav,
// src/app/(app)/layout.tsx) stays mounted and painted while this renders —
// only the content area below swaps. Real, static chrome (the "Home" title,
// the tab pill labels) renders as-is so only the actually-loading data
// (greeting name, currently-watching cards) shows as a placeholder; that
// keeps the swap from real content from being jarring.
export default function HomeLoading() {
  return (
    <div className="px-4 py-6">
      <SkeletonLine className="mb-1 h-3 w-28" />
      <h1 className="display mb-4 text-3xl">Home</h1>

      <div className="mb-5 grid grid-cols-2 border-[3px] border-ink">
        <div className="border-r-[3px] border-ink bg-acid px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-ink">
          Currently Watching
        </div>
        <div className="bg-paper px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
          Upcoming
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <SkeletonWatchingCard />
        <SkeletonWatchingCard />
        <SkeletonWatchingCard />
      </div>
    </div>
  );
}
