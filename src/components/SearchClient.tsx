"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import SearchResultCard from "@/components/SearchResultCard";
import type { SearchResult, WatchStatus } from "@/lib/types";

// Query input + results grid. `existing` maps "source:sourceId" -> the
// caller's current bucket for that title, computed server-side, so results
// already in the library render as "In Watching" etc. instead of an add
// control.
export default function SearchClient({
  existing,
}: {
  existing: Record<string, WatchStatus>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search failed");
      const json = (await res.json()) as { results: SearchResult[] };
      setResults(json.results);
      setSearched(true);
    } catch {
      setError("Search failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={runSearch} className="mb-5 flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search TV shows or anime…"
          className="hard-shadow-sm flex-1 border-[3px] border-ink bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink-soft"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="hard-shadow-sm border-[3px] border-ink bg-acid px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {loading ? "…" : "Go"}
        </button>
      </form>

      {error && (
        <p className="card-bold mb-4 px-4 py-3 text-sm text-ink-soft">{error}</p>
      )}

      {searched && !loading && !error && results.length === 0 && (
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          No results for &ldquo;{query}&rdquo;.
        </p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {results.map((result) => (
            <SearchResultCard
              key={`${result.source}:${result.sourceId}`}
              result={result}
              existingStatus={existing[`${result.source}:${result.sourceId}`]}
              onAdded={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
