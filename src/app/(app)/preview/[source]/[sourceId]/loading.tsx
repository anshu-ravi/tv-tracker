import BackButton from "@/components/BackButton";
import { SkeletonLine } from "@/components/Skeleton";

// Matches PreviewPage's layout: backdrop, poster + title/action-bar block,
// overview text, cast row, episode list, similar rail.
export default function PreviewLoading() {
  return (
    <div className="pb-10">
      <div className="relative">
        <div className="aspect-[16/9] w-full animate-pulse border-b-[3px] border-ink bg-panel" />
        <div className="absolute left-4 top-4">
          <BackButton />
        </div>
      </div>

      <div className="flex gap-4 px-4 pt-4">
        <div className="h-36 w-24 shrink-0 animate-pulse border-[3px] border-ink bg-panel" />
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-1">
          <SkeletonLine className="h-6 w-4/5" />
          <SkeletonLine className="h-2.5 w-1/3" />
          <SkeletonLine className="h-8 w-1/2" />
          <SkeletonLine className="h-2.5 w-2/5" />
        </div>
      </div>

      <div className="px-4 pt-4">
        <SkeletonLine className="h-3 w-full" />
        <SkeletonLine className="mt-1.5 h-3 w-5/6" />
        <SkeletonLine className="mt-1.5 h-3 w-2/3" />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        <div className="h-28 w-20 shrink-0 animate-pulse border-[3px] border-ink bg-panel" />
        <div className="h-28 w-20 shrink-0 animate-pulse border-[3px] border-ink bg-panel" />
        <div className="h-28 w-20 shrink-0 animate-pulse border-[3px] border-ink bg-panel" />
      </div>

      <div className="mt-6 px-4">
        <h2 className="display text-xl">Episodes</h2>
        <div className="mt-3 flex flex-col gap-2">
          <SkeletonLine className="h-16 w-full" />
          <SkeletonLine className="h-16 w-full" />
          <SkeletonLine className="h-16 w-full" />
          <SkeletonLine className="h-16 w-full" />
        </div>
      </div>
    </div>
  );
}
