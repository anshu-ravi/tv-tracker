import { SkeletonLine } from "@/components/Skeleton";

export default function AddFriendLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <div className="card-bold flex animate-pulse flex-col items-center gap-4 p-6">
        <SkeletonLine className="h-20 w-20" />
        <SkeletonLine className="h-6 w-40" />
        <SkeletonLine className="h-10 w-32" />
      </div>
    </div>
  );
}
