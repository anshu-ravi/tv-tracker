import { SkeletonLine } from "@/components/Skeleton";
import { StatsStripFallback } from "@/components/account/StatsStrip";

// Matches AccountPage's layout: profile header, stats strip, two row groups.
export default function AccountLoading() {
  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 shrink-0 animate-pulse border-[3px] border-ink bg-panel" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SkeletonLine className="h-5 w-1/2" />
          <SkeletonLine className="h-2.5 w-1/4" />
        </div>
      </div>
      <StatsStripFallback />
      <div className="mt-11 h-[200px] animate-pulse border-2 border-ink bg-panel" />
      <div className="mt-11 h-[134px] animate-pulse border-2 border-ink bg-panel" />
    </div>
  );
}
