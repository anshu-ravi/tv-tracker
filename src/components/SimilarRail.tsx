"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ExploreRail from "@/components/ExploreRail";
import { SkeletonPoster } from "@/components/Skeleton";
import type { DataSource, ExistingLibraryEntry, MediaType, SearchResult } from "@/lib/types";

const SKELETON_COUNT = 4;

// "Similar" rail at the bottom of both title screens — fetches TMDB
// recommendations/similar titles for this title and lets the user add one
// inline. Reuses ExploreRail (the Search screen's trending-rail component)
// so the horizontal-scroll layout and add-to-bucket behavior stay identical.
export default function SimilarRail({
  source,
  sourceId,
  mediaType,
}: {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
}) {
  const router = useRouter();
  const [results, setResults] = useState<SearchResult[]>([]);
  const [existing, setExisting] = useState<Record<string, ExistingLibraryEntry>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const params = new URLSearchParams({ source, sourceId, mediaType });
        const res = await fetch(`/api/titles/similar?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Similar fetch failed");
        const json = (await res.json()) as {
          results: SearchResult[];
          existing: Record<string, ExistingLibraryEntry>;
        };
        setResults(json.results);
        setExisting(json.existing);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Decorative rail — a failure just leaves results empty, which
        // renders nothing (ExploreRail returns null for an empty list).
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [source, sourceId, mediaType]);

  const heading = mediaType === "movie" ? "Similar Movies" : "Similar";

  if (loading) {
    return (
      <section className="mb-5 pt-2">
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex w-max gap-3">
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div key={i} className="w-28 shrink-0">
                <SkeletonPoster />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <ExploreRail
      heading={heading}
      results={results}
      existing={existing}
      onAdded={() => router.refresh()}
      headingClassName="text-xl"
    />
  );
}
