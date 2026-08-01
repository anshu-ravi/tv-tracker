"use client";

import { useState } from "react";
import Link from "next/link";
import type { SearchResult, WatchStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: WatchStatus; label: string }[] = [
  { value: "watchlist", label: "Watchlist" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dnf", label: "DNF" },
];

// One search result tile with an inline add-to-bucket control. Status
// defaults to "watchlist" per the spec; once added, the control collapses
// into a stamp showing which bucket it landed in. The poster is always
// tappable: once a title is in the library (already, via `existingTitleId`,
// or freshly added, via the POST response) it links to the real /title/:id
// page; until then it links to the live, read-only /preview/:source/:id
// route so a not-yet-added show is still browsable.
export default function SearchResultCard({
  result,
  existingStatus,
  existingTitleId,
  onAdded,
}: {
  result: SearchResult;
  existingStatus?: WatchStatus;
  existingTitleId?: string;
  onAdded: () => void;
}) {
  const [status, setStatus] = useState<WatchStatus>(existingStatus ?? "watchlist");
  const [pending, setPending] = useState(false);
  const [savedStatus, setSavedStatus] = useState<WatchStatus | undefined>(
    existingStatus,
  );
  const [savedTitleId, setSavedTitleId] = useState<string | undefined>(
    existingTitleId,
  );
  const [errored, setErrored] = useState(false);

  async function handleAdd() {
    setPending(true);
    setErrored(false);
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: result.source,
          sourceId: result.sourceId,
          mediaType: result.mediaType,
          status,
        }),
      });
      if (!res.ok) throw new Error("Failed to add title");
      const body = (await res.json()) as { titleId: string };
      setSavedStatus(status);
      setSavedTitleId(body.titleId);
      onAdded();
    } catch {
      setErrored(true);
    } finally {
      setPending(false);
    }
  }

  const poster = result.posterUrl ? (
    <img
      src={result.posterUrl}
      alt={result.title}
      className="h-full w-full object-cover"
      loading="lazy"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center p-2 text-center">
      <span className="display text-sm leading-tight text-ink-soft">
        {result.title}
      </span>
    </div>
  );

  // The preview route can't tell tv from anime from a bare tmdb id (see the
  // preview page) since both now come from the same provider, so carry the
  // classified mediaType along as a query param.
  const posterHref = savedTitleId
    ? `/title/${savedTitleId}`
    : `/preview/${result.source}/${result.sourceId}?mediaType=${result.mediaType}`;

  return (
    <div className="card-bold overflow-hidden p-0">
      <Link href={posterHref}>
        <div className="aspect-[2/3] w-full border-b-[3px] border-ink bg-panel">
          {poster}
        </div>
      </Link>

      <div className="p-1.5">
        <p className="truncate text-[10px] font-bold uppercase tracking-wide">
          {result.title}
        </p>
        <p className="text-[9px] uppercase text-ink-soft">
          {result.mediaType}
          {result.year ? ` · ${result.year}` : ""}
        </p>

        {savedStatus ? (
          <p className="stamp mt-2 block w-full text-center text-[10px]">
            In {STATUS_OPTIONS.find((o) => o.value === savedStatus)?.label ?? savedStatus}
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as WatchStatus)}
              className="border-[3px] border-ink bg-paper px-1 py-1 text-[10px] font-bold uppercase tracking-wide"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAdd}
              disabled={pending}
              className="hard-shadow-sm border-[3px] border-ink bg-acid px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add"}
            </button>
            {errored && (
              <p className="text-[10px] text-ink-soft">Failed — try again.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
