import BackButton from "@/components/BackButton";
import { SkeletonLine } from "@/components/Skeleton";

// Matches StatsPage's layout: back button, heading, then a stack of stat
// panel cards (hero tiles, tv-vs-anime, top shows, by-year, status
// distribution, fun stats) — each rendered here as one generic pulsing
// card-bold block since the real panels vary in internal shape.
export default function StatsLoading() {
  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton />
      <h1 className="display mb-4 mt-4 text-3xl">Your Stats</h1>

      <div className="space-y-4">
        <div className="card-bold grid animate-pulse grid-cols-2 gap-3 p-4">
          <SkeletonLine className="h-14 w-full" />
          <SkeletonLine className="h-14 w-full" />
          <SkeletonLine className="h-14 w-full" />
          <SkeletonLine className="h-14 w-full" />
        </div>
        <div className="card-bold h-24 animate-pulse p-4" />
        <div className="card-bold h-40 animate-pulse p-4" />
        <div className="card-bold h-32 animate-pulse p-4" />
        <div className="card-bold h-28 animate-pulse p-4" />
      </div>
    </div>
  );
}
