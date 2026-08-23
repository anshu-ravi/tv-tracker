"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import SearchResultCard from "@/components/SearchResultCard";
import ExploreRail from "@/components/ExploreRail";
import { RefreshIcon } from "@/components/icons";
import { organizeRecommendationRails, shouldShowEmptyRecommendationsState } from "@/lib/exploreRails";
import {
  titleKey,
  type DataSource,
  type ExistingLibraryEntry,
  type MediaType,
  type RecommendationItem,
  type RecommendationRail,
  type SearchResult,
} from "@/lib/types";

const DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;
const TOAST_DURATION_MS = 4000;

const FOR_YOU_HEADINGS: Record<string, string> = {
  for_you_tv: "For You — TV",
  for_you_anime: "For You — Anime",
  for_you_movie: "For You — Movies",
};

interface DismissTriple {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
}

// One rail slot's position + item, recorded at dismiss time so Undo (or a
// failed dismiss) can put the card back exactly where it was instead of
// just appending it.
interface RailSlot {
  rail: string;
  index: number;
  item: RecommendationItem;
}

// Query input + results grid, now also the Explore screen: empty input shows
// personalized + trending rails, typing shows search results (unchanged
// pattern from the old Search screen this replaces).
export default function ExploreClient({
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

  // Trending rails — fetched once on mount, independent of the debounced
  // search-results fetch below. Rendered last on the Explore screen, as a
  // fallback and for genuinely new releases.
  const [exploreTv, setExploreTv] = useState<SearchResult[]>([]);
  const [exploreAnime, setExploreAnime] = useState<SearchResult[]>([]);
  const [exploreLoading, setExploreLoading] = useState(true);
  const [exploreError, setExploreError] = useState<string | null>(null);

  // Personalized recommendation rails (GET /api/recommendations). Kept
  // separate from the trending state above so a failure here never blocks
  // trending from rendering — this screen must never be blank.
  const [recRails, setRecRails] = useState<RecommendationRail[]>([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recFetchFailed, setRecFetchFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [toast, setToast] = useState<{ message: string; onUndo: (() => void) | null } | null>(
    null,
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmedQuery = query.trim();
  // Below the minimum length, there's nothing to fetch — rendering derives
  // straight from this instead of resetting results/searched/error state
  // synchronously inside the effect (which is really just derived state, not
  // a side effect, and trips react-hooks/set-state-in-effect).
  const queryTooShort = trimmedQuery.length < MIN_QUERY_LENGTH;
  // Explore only shows for a literally-empty input, not "too short" (1
  // character) — a single character shouldn't flash the rails.
  const isExploring = trimmedQuery.length === 0;

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetch("/api/recommendations", { signal: controller.signal });
        if (!res.ok) throw new Error("Recommendations fetch failed");
        const json = (await res.json()) as { rails: RecommendationRail[] };
        setRecRails(json.rails);
        setRecFetchFailed(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setRecFetchFailed(true);
      } finally {
        if (!controller.signal.aborted) setRecLoading(false);
      }
    })();

    return () => controller.abort();
  }, []);

  // Shared by both the mount effect above and handleRefresh below — not
  // itself called from an effect body (that trips
  // react-hooks/set-state-in-effect), only from the refresh button's click
  // handler.
  async function reloadRecommendations() {
    try {
      const res = await fetch("/api/recommendations");
      if (!res.ok) throw new Error("Recommendations fetch failed");
      const json = (await res.json()) as { rails: RecommendationRail[] };
      setRecRails(json.rails);
      setRecFetchFailed(false);
    } catch {
      setRecFetchFailed(true);
    } finally {
      setRecLoading(false);
    }
  }

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

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch("/api/recommendations/refresh", { method: "POST" });
    } catch {
      // Swallow — the reload below just re-shows whatever's already stored.
    } finally {
      await reloadRecommendations();
      setRefreshing(false);
    }
  }

  function showToast(message: string, onUndo: (() => void) | null) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, onUndo });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }

  function dismissToast() {
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }

  function restoreCard(snapshot: RailSlot[]) {
    setRecRails((prev) =>
      prev.map((rail) => {
        const slot = snapshot.find((s) => s.rail === rail.rail);
        if (!slot) return rail;
        const items = [...rail.items];
        items.splice(Math.min(slot.index, items.length), 0, slot.item);
        return { ...rail, items };
      }),
    );
  }

  function handleDismiss(triple: DismissTriple) {
    const key = titleKey(triple.source, triple.sourceId, triple.mediaType);

    const snapshot: RailSlot[] = [];
    for (const rail of recRails) {
      const index = rail.items.findIndex(
        (i) => titleKey(i.source, i.sourceId, i.mediaType) === key,
      );
      if (index !== -1) snapshot.push({ rail: rail.rail, index, item: rail.items[index] });
    }
    if (snapshot.length === 0) return;
    const title = snapshot[0].item.title;

    setRecRails((prev) =>
      prev.map((rail) => ({
        ...rail,
        items: rail.items.filter((i) => titleKey(i.source, i.sourceId, i.mediaType) !== key),
      })),
    );

    showToast(`Removed “${title}”`, () => handleUndo(triple, snapshot));

    (async () => {
      try {
        const res = await fetch("/api/recommendations/dismiss", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(triple),
        });
        if (!res.ok) throw new Error("Dismiss failed");
      } catch {
        restoreCard(snapshot);
        showToast("Couldn't remove — try again", null);
      }
    })();
  }

  async function handleUndo(triple: DismissTriple, snapshot: RailSlot[]) {
    dismissToast();
    restoreCard(snapshot);
    try {
      await fetch("/api/recommendations/dismiss", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(triple),
      });
    } catch {
      // Best-effort, matching the rest of this app's undo flows — a failed
      // undo just leaves the dismissal recorded server-side even though the
      // card is showing again locally.
    }
  }

  const { becauseRails, forYouRails } = organizeRecommendationRails(recRails);
  const showEmptyRecState = shouldShowEmptyRecommendationsState({
    loading: recLoading,
    fetchFailed: recFetchFailed,
    railCount: recRails.length,
  });

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
        {isExploring && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh recommendations"
            className="hard-shadow-sm flex h-11 w-11 shrink-0 items-center justify-center border-[3px] border-ink bg-paper transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
          >
            <RefreshIcon className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {isExploring && showEmptyRecState && (
        <div className="card-bold mb-5 flex flex-col items-center gap-3 p-6 text-center">
          <p className="display text-lg">No Picks Yet</p>
          <p className="text-xs text-ink-soft">
            Build your Explore feed from what you&rsquo;ve tracked.
          </p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="hard-shadow-sm border-[3px] border-ink bg-acid px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
          >
            {refreshing ? "Building…" : "Build My Feed"}
          </button>
        </div>
      )}

      {isExploring && (
        <>
          {becauseRails.map((rail) => (
            <ExploreRail
              key={rail.rail}
              heading={`Because you finished ${rail.seedTitle!.title}`}
              results={rail.items}
              existing={existing}
              onAdded={() => router.refresh()}
              onDismiss={(r) => handleDismiss(r)}
            />
          ))}

          {forYouRails.map((rail) => (
            <ExploreRail
              key={rail.rail}
              heading={FOR_YOU_HEADINGS[rail.rail] ?? rail.rail}
              results={rail.items}
              existing={existing}
              onAdded={() => router.refresh()}
              onDismiss={(r) => handleDismiss(r)}
            />
          ))}
        </>
      )}

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
        exploreAnime.length === 0 &&
        becauseRails.length === 0 &&
        forYouRails.length === 0 &&
        !showEmptyRecState && (
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
            isFirstSection={
              becauseRails.length === 0 && forYouRails.length === 0 && exploreTv.length > 0
            }
          />
          <ExploreRail
            heading="Trending Anime"
            results={exploreAnime}
            existing={existing}
            onAdded={() => router.refresh()}
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
          {results.map((result) => {
            const key = titleKey(result.source, result.sourceId, result.mediaType);
            return (
              <SearchResultCard
                key={key}
                result={result}
                existingStatus={existing[key]?.status}
                existingTitleId={existing[key]?.titleId}
                onAdded={() => router.refresh()}
              />
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.32, ease: [0.2, 0.9, 0.25, 1] }}
            style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.5rem)" }}
            className="fixed inset-x-4 z-30 mx-auto flex max-w-[calc(28rem-2rem)] items-center justify-between gap-3 border-[3px] border-ink bg-ink px-3 py-2 shadow-[4px_4px_0_0_rgba(199,255,62,0.9)]"
          >
            <span className="text-xs font-bold uppercase tracking-wide text-paper">
              {toast.message}
            </span>
            {toast.onUndo ? (
              <button
                type="button"
                onClick={toast.onUndo}
                className="shrink-0 border-2 border-acid px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-acid"
              >
                Undo
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
