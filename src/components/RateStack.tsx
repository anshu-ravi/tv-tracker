"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import RatingControl from "@/components/RatingControl";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";
import type { RateQueueItem } from "@/lib/rateQueue";
import {
  adjustRating,
  applyBack,
  applyNext,
  applySkip,
  clearFailedRating,
  getSessionRating,
  recordFailedRating,
  saveWithRetry,
  type FailedRatings,
  type SessionRatings,
} from "@/lib/rateSession";

// Long-sitting, one-handed bulk rating flow (the ~180-title backlog this was
// built for). The layout is deliberately static between cards -- only the
// poster/title/rating swap -- so the controls never move under the owner's
// thumb. A rating saves in the background (retried once on failure);
// advancing to the next card never waits on the network round trip.
// Ratings entered this session are kept in `ratings` so Back rehydrates a
// revisited card instead of showing it blank.
//
// Adjusting the value (drag or -/+) and committing it are deliberately
// separate: adjusting only updates the draft in `ratings`, and NEXT is the
// one action that saves + advances. Without that split, every nudge of the
// -/+ buttons would fire a save and skip to the next card, making fine
// adjustment impossible.
export default function RateStack({ queue }: { queue: RateQueueItem[] }) {
  const [index, setIndex] = useState(0);
  const [ratings, setRatings] = useState<SessionRatings>({});
  const [failed, setFailed] = useState<FailedRatings>({});
  const [retrying, setRetrying] = useState(false);

  const total = queue.length;
  const current = queue[index];
  const failedCount = Object.keys(failed).length;

  async function attemptSave(titleId: string, rating: number | null): Promise<boolean> {
    const res = await fetch(`/api/titles/${titleId}/rating`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating }),
    });
    return res.ok;
  }

  function saveRating(titleId: string, rating: number | null) {
    setFailed((prev) => clearFailedRating(prev, titleId));
    saveWithRetry(() => attemptSave(titleId, rating)).then((ok) => {
      if (!ok) setFailed((prev) => recordFailedRating(prev, titleId, rating));
    });
  }

  function onAdjust(rating: number | null) {
    if (!current) return;
    setRatings((prev) => adjustRating({ index, ratings: prev }, current.titleId, rating).ratings);
  }

  function onNext() {
    if (!current) return;
    const { state, save } = applyNext({ index, ratings }, current.titleId);
    if (save == null) return; // NEXT is disabled in the UI for this case; guard belt-and-braces.
    saveRating(current.titleId, save);
    setIndex(state.index);
  }

  function onSkip() {
    if (!current) return;
    setIndex(applySkip({ index, ratings }).index);
  }

  function onBack() {
    setIndex(applyBack({ index, ratings }).index);
  }

  async function retryAllFailed() {
    setRetrying(true);
    const entries = Object.entries(failed);
    for (const [titleId, rating] of entries) {
      const ok = await saveWithRetry(() => attemptSave(titleId, rating));
      if (ok) setFailed((prev) => clearFailedRating(prev, titleId));
    }
    setRetrying(false);
  }

  if (!current) {
    return (
      <div className="flex flex-col gap-4">
        <div className="card-bold flex flex-col items-center gap-4 p-8 text-center">
          <span className="stamp text-lg">All done</span>
          <p className="text-sm text-ink-soft">
            {total === 0
              ? "Nothing to rate right now — every tracked title already has a rating."
              : "You've rated everything in the queue."}
          </p>
          <Link
            href="/account"
            className="hard-shadow-sm border-[3px] border-ink bg-acid px-4 py-2 text-xs font-bold uppercase tracking-wide"
          >
            Back to Account
          </Link>
        </div>

        {failedCount > 0 && (
          <div className="card-bold flex flex-col gap-3 p-4">
            <p className="text-sm font-bold uppercase tracking-wide">
              {failedCount} rating{failedCount === 1 ? "" : "s"} didn&rsquo;t save
            </p>
            <button
              type="button"
              onClick={retryAllFailed}
              disabled={retrying}
              className="hard-shadow-sm border-[3px] border-ink bg-acid px-4 py-2.5 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Retry all"}
            </button>
          </div>
        )}
      </div>
    );
  }

  const currentRating = getSessionRating(ratings, current.titleId);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
        {index + 1} of {total}
      </p>

      <div className="card-bold flex flex-col gap-4 p-4">
        <div className="flex gap-4">
          <div className="relative h-40 w-28 shrink-0 overflow-hidden border-[3px] border-ink bg-panel">
            {current.posterUrl ? (
              <Image
                src={buildTmdbImageUrl(current.posterUrl, 280)}
                alt={current.title}
                fill
                sizes="112px"
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col justify-center gap-1.5">
            <h2 className="display text-xl leading-tight">{current.title}</h2>
            <p className="flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
              {current.year && <span>{current.year}</span>}
              <span>{current.mediaType}</span>
            </p>
            {current.titleId in failed && <p className="text-[10px] text-ink-soft">That didn&rsquo;t save.</p>}
          </div>
        </div>

        <RatingControl key={current.titleId} value={currentRating} onChange={onAdjust} />
      </div>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onNext}
          disabled={currentRating == null}
          className="hard-shadow w-full border-[3px] border-ink bg-acid px-6 py-4 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
        >
          Next →
        </button>
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={index === 0}
            className="hard-shadow-sm border-[3px] border-ink bg-paper px-4 py-2.5 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="hard-shadow-sm border-[3px] border-ink bg-paper px-6 py-2.5 text-xs font-bold uppercase tracking-wide"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
