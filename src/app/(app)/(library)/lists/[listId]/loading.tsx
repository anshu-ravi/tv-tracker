import BackButton from "@/components/BackButton";
import { SkeletonLine, SkeletonPosterGrid } from "@/components/Skeleton";

// Nested one level below (library)/lists — without its own loading.tsx this
// route would inherit lists/loading.tsx's list-ROW skeleton, which is the
// wrong shape for a list's own poster-grid detail view. BackButton has no
// server data dependency (router.back()), so it's safe to render for real
// here rather than as a placeholder.
export default function ListDetailLoading() {
  return (
    <div className="pb-6">
      <div className="flex items-center justify-between gap-2 px-4 pt-6">
        <BackButton />
      </div>

      <div className="px-4 pt-4">
        <SkeletonLine className="h-8 w-2/3" />
        <SkeletonLine className="mt-2 h-3 w-20" />
      </div>

      <div className="px-4 pt-5">
        <SkeletonPosterGrid count={6} />
      </div>
    </div>
  );
}
