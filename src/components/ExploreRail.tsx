import SearchResultCard from "@/components/SearchResultCard";
import { titleKey, type ExistingLibraryEntry, type SearchResult } from "@/lib/types";

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
  onDismiss,
  isFirstSection = false,
  headingClassName = "text-lg",
}: {
  heading: string;
  results: SearchResult[];
  existing: Record<string, ExistingLibraryEntry>;
  onAdded: () => void;
  // True only for the first rail rendered on the Explore screen's pre-query
  // state (the leading rail) — its first couple of cards are what's actually
  // above the fold; rails below it never are.
  isFirstSection?: boolean;
  // Lets a caller outside Explore (e.g. SimilarRail, which matches a title
  // page's larger section headings) size the heading differently.
  headingClassName?: string;
  // Explore-only reject control (see ExploreClient) — omitted everywhere
  // else, so SearchResultCard renders no dismiss affordance there.
  onDismiss?: (result: SearchResult) => void;
}) {
  if (results.length === 0) return null;

  return (
    <section className="mb-5">
      <h2 className={`display mb-2 ${headingClassName}`}>{heading}</h2>
      <div className="-mx-4 overflow-x-auto px-4 pb-2">
        <div className="flex w-max snap-x snap-mandatory gap-3">
          {results.map((result, index) => {
            const key = titleKey(result.source, result.sourceId, result.mediaType);
            return (
              <div key={key} className="w-28 shrink-0 snap-start">
                <SearchResultCard
                  result={result}
                  existingStatus={existing[key]?.status}
                  existingTitleId={existing[key]?.titleId}
                  onAdded={onAdded}
                  onDismiss={onDismiss ? () => onDismiss(result) : undefined}
                  priority={isFirstSection && index < 2}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
