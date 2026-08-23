import ExploreLoading from "@/app/(app)/explore/loading";

// /search immediately redirects to /explore (old bookmarks) — reuse
// Explore's skeleton so a slow redirect doesn't flash blank.
export default function SearchLoading() {
  return <ExploreLoading />;
}
