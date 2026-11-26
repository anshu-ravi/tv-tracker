import BackButton from "@/components/BackButton";
import { SkeletonLine } from "@/components/Skeleton";

// Mirrors StatsPage: hero strip, then labelled 2px groups.
export default function StatsLoading() {
  return (
    <div className="mx-auto max-w-md animate-pulse px-4 py-6">
      <BackButton fallbackHref="/account" />
      <h1 className="display mb-4 mt-4 text-3xl">Your Stats</h1>

      <div className="h-[62px] border-2 border-ink bg-panel" />
      {["h-[92px]", "h-[52px]", "h-[200px]", "h-[52px]"].map((h, i) => (
        <div key={i} className="mt-6">
          <SkeletonLine className="mb-2 h-3 w-24" />
          <div className={`${h} border-2 border-ink bg-paper`} />
        </div>
      ))}
    </div>
  );
}
