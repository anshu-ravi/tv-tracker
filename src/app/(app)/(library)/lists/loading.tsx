import { SkeletonListRow } from "@/components/Skeleton";

// Matches ListsPage's layout: heading, the (client, non-async) create-list
// form's slot is skipped since that form has no server data dependency of
// its own, then a stack of list rows.
export default function ListsLoading() {
  return (
    <div className="px-4 pt-4 pb-6">
      <h1 className="display mb-4 text-2xl">Lists</h1>
      <div className="flex flex-col gap-3">
        <SkeletonListRow />
        <SkeletonListRow />
        <SkeletonListRow />
      </div>
    </div>
  );
}
