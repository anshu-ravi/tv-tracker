import type { RecommendationRail } from "@/lib/types";

// Pure decision logic behind ExploreClient's rail layout, factored out so
// it's unit-testable without rendering. The component wires this to its
// fetched `recRails` state; this module just answers "given the stored
// rails, what should render and in what order."

const FOR_YOU_ORDER = ["for_you_tv", "for_you_anime", "for_you_movie"];

export interface OrganizedRails {
  becauseRails: RecommendationRail[];
  forYouRails: RecommendationRail[];
}

// Splits stored Explore rails into the "because you finished X" group
// (highest-quality, rendered first) and the ranked for_you_tv/anime/movie
// group, dropping any rail with no items so an empty rail never renders a
// heading over nothing.
export function organizeRecommendationRails(rails: RecommendationRail[]): OrganizedRails {
  const becauseRails = rails.filter(
    (r) => r.rail.startsWith("because:") && r.seedTitle != null && r.items.length > 0,
  );
  const forYouRails = FOR_YOU_ORDER.map((key) => rails.find((r) => r.rail === key)).filter(
    (r): r is RecommendationRail => r != null && r.items.length > 0,
  );
  return { becauseRails, forYouRails };
}

// First-run (or fully-dismissed) empty state: only show the "build your
// feed" prompt once the fetch has actually succeeded and come back with
// nothing -- never while still loading, and never on a failed fetch, where
// the trending rails are the fallback instead.
export function shouldShowEmptyRecommendationsState(params: {
  loading: boolean;
  fetchFailed: boolean;
  railCount: number;
}): boolean {
  return !params.loading && !params.fetchFailed && params.railCount === 0;
}
