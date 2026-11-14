import BackButton from "@/components/BackButton";
import { SkeletonLine } from "@/components/Skeleton";

// Matches ResolvePage's layout: heading + intro, then the poster card and answer buttons.
export default function ResolveLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account" />

      <h1 className="display mb-1 mt-4 text-3xl">Resolve Titles</h1>
      <p className="mb-4 text-xs text-ink-soft">
        These shows had a recent season we weren&rsquo;t sure you&rsquo;d seen. Earlier seasons are
        already marked watched.
      </p>

      <div className="flex flex-col gap-4">
        <SkeletonLine className="h-2.5 w-16" />
        <div className="card-bold flex flex-col gap-4 p-4">
          <div className="mx-auto aspect-[2/3] w-full max-w-[260px] animate-pulse border-[3px] border-ink bg-panel" />
          <SkeletonLine className="mx-auto h-6 w-3/4" />
        </div>
        <div className="h-[52px] w-full animate-pulse border-[3px] border-ink bg-panel" />
      </div>
    </div>
  );
}
