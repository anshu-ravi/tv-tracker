import BucketedGridPage from "@/components/BucketedGridPage";

// Movies have no "watching" bucket (see CLAUDE.md's movies product
// decision) — only Watchlist, Completed, and DNF apply.
export default function MoviesPage() {
  return (
    <BucketedGridPage
      mediaType="movie"
      heading="Movies"
      buckets={["watchlist", "completed", "dnf"]}
    />
  );
}
