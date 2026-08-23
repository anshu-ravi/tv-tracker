import BackButton from "@/components/BackButton";
import { SkeletonLine } from "@/components/Skeleton";

// Matches RatePage's layout: heading + intro copy (static), then the
// RateStack's progress label, poster card, and Next/Back button row.
export default function RateLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton />

      <h1 className="display mb-1 mt-4 text-3xl">Rate Your Titles</h1>
      <p className="mb-4 text-xs text-ink-soft">
        Drag to set a rating in tenths, or nudge with −/+ for precision, then tap Next to save it.
        Skip whatever you don&rsquo;t want to grade.
      </p>

      <div className="flex flex-col gap-4">
        <SkeletonLine className="h-2.5 w-16" />

        <div className="card-bold flex flex-col gap-4 p-4">
          <div className="flex gap-4">
            <div className="h-40 w-28 shrink-0 animate-pulse border-[3px] border-ink bg-panel" />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <SkeletonLine className="h-5 w-3/4" />
              <SkeletonLine className="h-2.5 w-1/3" />
            </div>
          </div>
          <div className="h-10 w-full animate-pulse rounded-full border-[3px] border-ink bg-panel" />
        </div>

        <div className="h-[52px] w-full animate-pulse border-[3px] border-ink bg-panel" />
      </div>
    </div>
  );
}
