import BackButton from "@/components/BackButton";
import { SkeletonLine } from "@/components/Skeleton";

export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account/friends" />
      <div className="mt-4 flex animate-pulse flex-col gap-3">
        <div className="card-bold flex flex-col items-center gap-3 p-5">
          <SkeletonLine className="h-20 w-20" />
          <SkeletonLine className="h-7 w-40" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonLine key={i} className="aspect-[2/3] w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
