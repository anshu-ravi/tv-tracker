import BackButton from "@/components/BackButton";
import { SkeletonLine } from "@/components/Skeleton";

export default function RatingsLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account" />
      <h1 className="display mb-4 mt-4 text-3xl">Your Ratings</h1>
      <div className="space-y-5">
        <div className="h-[38px] w-full animate-pulse rounded-[10px] border-[3px] border-ink bg-panel" />
        <div>
          <SkeletonLine className="mb-3 h-5 w-24" />
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-[2/3] w-[42vw] max-w-[168px] shrink-0 animate-pulse border-[3px] border-ink bg-panel" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
