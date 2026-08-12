import { SkeletonLine } from "@/components/Skeleton";

// Matches AccountPage's layout: heading, profile card, sign-out row, refresh
// button, stats link.
export default function AccountLoading() {
  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Account</h1>

      <div className="card-bold flex items-center gap-3 p-4">
        <div className="h-14 w-14 shrink-0 animate-pulse rounded-none border-[3px] border-ink bg-panel" />
        <div className="min-w-0 flex-1 flex flex-col gap-2">
          <SkeletonLine className="h-3 w-2/5" />
          <SkeletonLine className="h-2.5 w-3/5" />
        </div>
      </div>

      <div className="card-bold mt-3 h-16 animate-pulse p-4" />
      <div className="card-bold mt-3 h-14 animate-pulse p-4" />
      <div className="card-bold mt-3 h-14 animate-pulse bg-acid p-4" />
    </div>
  );
}
