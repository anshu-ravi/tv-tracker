import { SkeletonLine, SkeletonWatchingCard } from "@/components/Skeleton";

// Home's route-level fallback; static chrome renders as-is so only the data placeholders swap.
export default function HomeLoading() {
  return (
    <div className="px-4 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="display text-2xl">Home</h1>
        <SkeletonLine className="h-3 w-24" />
      </div>

      <div className="mb-5 mt-3 grid grid-cols-2 border-[3px] border-ink">
        <div className="border-r-[3px] border-ink bg-ink px-3 py-2 text-center text-xs font-extrabold uppercase tracking-wide text-paper">
          Watching
        </div>
        <div className="bg-paper px-3 py-2 text-center text-xs font-extrabold uppercase tracking-wide text-ink-soft">
          Upcoming
        </div>
      </div>

      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Up next</h2>
      <div className="flex flex-col gap-3">
        <SkeletonWatchingCard />
        <SkeletonWatchingCard />
        <SkeletonWatchingCard />
      </div>
    </div>
  );
}
