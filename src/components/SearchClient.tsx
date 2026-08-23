"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SearchResultCard from "@/components/SearchResultCard";
import ExploreRail from "@/components/ExploreRail";
import type { SearchResult } from "@/lib/types";
import type { ExistingLibraryEntry } from "@/app/(app)/search/page";

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;

// Query input + results grid. `existing` maps "source:sourceId" -> the
// caller's current bucket + catalog title id for that title, computed
// server-side, so results already in the library render as "In Watching"
// etc. (linking to the detail page) instead of an add control.
export default function SearchClient({
  existing,
}: {
  existing: Record<string, ExistingLibraryEntry>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Explore state (trending rails) — fetched once on mount, independent of
  // the debounced search-results fetch below. Only ever shown/used while
  // the query input is completely empty (see isExploring).
  const [exploreTv, setExploreTv] = useState<SearchResult[]>([]);
  const [exploreAnime, setExploreAnime] = useState<SearchResult[]>([]);
  const [exploreLoading, setExploreLoading] = useState(true);
  const [exploreError, setExploreError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  // Below the minimum length, there's nothing to fetch — rendering derives
  // straight from this instead of resetting results/searched/error state
  // synchronously inside the effect (which is really just derived state, not
  // a side effect, and trips react-hooks/set-state-in-effect).
  const queryTooShort = trimmedQuery.length < MIN_QUERY_LENGTH;
  // Explore only shows for a literally-empty input, not "too short" (1
  // character) — a single character shouldn't flash trending rails.
  const isExploring = trimmedQuery.length === 0;

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/search/explore", {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Explore fetch failed");
        const json = (await res.json()) as {
          tv: SearchResult[];
          anime: SearchResult[];
        };
        setExploreTv(json.tv);
        setExploreAnime(json.anime);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setExploreError("Couldn't load trending titles.");
      } finally {
        if (!controller.signal.aborted) setExploreLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (queryTooShort) return;

    const controller = new AbortController();

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);

      (async () => {
        try {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(trimmedQuery)}`,
            { signal: controller.signal },
          );
          if (!res.ok) throw new Error("Search failed");
          const json = (await res.json()) as { results: SearchResult[] };
          setResults(json.results);
          setSearched(true);
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setError("Search failed. Try again.");
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery, queryTooShort]);

  return (
    <div>
      <div className="mb-5 flex gap-2">
        <div className="hard-shadow-sm relative flex-1 border-[3px] border-ink bg-paper">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search TV shows, anime, or movies…"
            className="w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-ink-soft"
          />
          {loading && !queryTooShort && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-soft">
              …
            </span>
          )}
        </div>
      </div>

      {isExploring && exploreLoading && (
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          Loading trending…
        </p>
      )}

      {isExploring &&
        !exploreLoading &&
        exploreError &&
        exploreTv.length === 0 &&
        exploreAnime.length === 0 && (
          <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
            {exploreError}
          </p>
        )}

      {isExploring &&
        !exploreLoading &&
        !exploreError &&
        exploreTv.length === 0 &&
        exploreAnime.length === 0 && (
          <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
            Nothing trending right now — try searching instead.
          </p>
        )}

      {isExploring && !exploreLoading && (
        <>
          <ExploreRail
            heading="Trending TV"
            results={exploreTv}
            existing={existing}
            onAdded={() => router.refresh()}
            isFirstSection={exploreTv.length > 0}
          />
          <ExploreRail
            heading="Trending Anime"
            results={exploreAnime}
            existing={existing}
            onAdded={() => router.refresh()}
            isFirstSection={exploreTv.length === 0 && exploreAnime.length > 0}
          />
        </>
      )}

      {!isExploring && !queryTooShort && error && (
        <p className="card-bold mb-4 px-4 py-3 text-sm text-ink-soft">{error}</p>
      )}

      {!isExploring && !queryTooShort && searched && !loading && !error && results.length === 0 && (
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          No results for &ldquo;{query}&rdquo;.
        </p>
      )}

      {!isExploring && !queryTooShort && results.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {results.map((result) => (
            <SearchResultCard
              key={`${result.source}:${result.sourceId}`}
              result={result}
              existingStatus={
                existing[`${result.source}:${result.sourceId}`]?.status
              }
              existingTitleId={
                existing[`${result.source}:${result.sourceId}`]?.titleId
              }
              onAdded={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
