import BackButton from "@/components/BackButton";
import { SkeletonLine } from "@/components/Skeleton";

export default function FriendsLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account" />
      <h1 className="display mb-4 mt-4 text-3xl">Friends</h1>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card-bold animate-pulse p-4">
            <SkeletonLine className="h-4 w-24" />
            <SkeletonLine className="mt-2 h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
