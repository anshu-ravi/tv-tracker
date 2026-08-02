import SearchResultCard from "@/components/SearchResultCard";
import type { SearchResult } from "@/lib/types";
import type { ExistingLibraryEntry } from "@/app/(app)/search/page";

// One horizontally-scrollable rail of trending results on the Search
// screen's pre-query Explore state — model matches CatchUpCarousel's
// scroll-container idiom (`-mx-4 overflow-x-auto px-4` bleeding to the
// page's edges, `flex w-max snap-x snap-mandatory gap-3` inside). Cards are
// the exact SearchResultCard used by the results grid, just narrower and
// laid out in a row instead of a 3-col grid, so add-to-bucket / "already in
// your library" behavior is identical.
export default function ExploreRail({
  heading,
  results,
  existing,
  onAdded,
  isFirstSection = false,
}: {
  heading: string;
  results: SearchResult[];
  existing: Record<string, ExistingLibraryEntry>;
  onAdded: () => void;
  // True only for the first rail rendered on the Search screen's Explore
  // state (Trending TV) — its first couple of cards are what's actually
  // above the fold; the Trending Anime rail below it never is.
  isFirstSection?: boolean;
}) {
  if (results.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className="display mb-2 text-lg">{heading}</h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex w-max snap-x snap-mandatory gap-3">
          {results.map((result, index) => (
            <div
              key={`${result.source}:${result.sourceId}`}
              className="w-28 shrink-0 snap-start"
            >
              <SearchResultCard
                result={result}
                existingStatus={
                  existing[`${result.source}:${result.sourceId}`]?.status
                }
                existingTitleId={
                  existing[`${result.source}:${result.sourceId}`]?.titleId
                }
                onAdded={onAdded}
                priority={isFirstSection && index < 2}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
