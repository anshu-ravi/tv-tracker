"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import RatingControl from "@/components/RatingControl";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";
import type { RateQueueItem } from "@/lib/rateQueue";

// Long-sitting, one-handed bulk rating flow (the ~180-title backlog this was
// built for). The layout is deliberately static between cards -- only the
// poster/title/rating swap -- so the controls never move under the owner's
// thumb. A rating saves in the background (fire-and-forget PATCH); advancing
// to the next card never waits on the network round trip.
export default function RateStack({ queue }: { queue: RateQueueItem[] }) {
  const [index, setIndex] = useState(0);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());

  const total = queue.length;
  const current = queue[index];

  function saveRating(item: RateQueueItem, rating: number | null) {
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.titleId);
      return next;
    });
    fetch(`/api/titles/${item.titleId}/rating`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rating }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to save rating");
      })
      .catch(() => {
        setFailedIds((prev) => new Set(prev).add(item.titleId));
      });
  }

  function onRate(rating: number | null) {
    if (!current) return;
    saveRating(current, rating);
    setIndex((i) => i + 1);
  }

  function onSkip() {
    if (!current) return;
    setIndex((i) => i + 1);
  }

  function onBack() {
    setIndex((i) => Math.max(0, i - 1));
  }

  if (!current) {
    return (
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
    );
  }

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
            {failedIds.has(current.titleId) && (
              <p className="text-[10px] text-ink-soft">That didn&rsquo;t save.</p>
            )}
          </div>
        </div>

        <RatingControl key={current.titleId} value={null} onChange={onRate} />
      </div>

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
  );
}
