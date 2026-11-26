"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import RatingControl from "@/components/RatingControl";
import { ChevronRightIcon } from "@/components/icons";

// A burst of -/+ nudges fires many onChange calls in quick succession; only
// the settled value needs to reach the network.
const SAVE_DEBOUNCE_MS = 500;

// Ratings-strip cell showing the owner's rating; tapping it opens the rating sheet.
// Saves are optimistic and debounced, so closing the sheet never loses a value.
export default function UserRatingCell({
  titleId,
  title,
  initialRating,
}: {
  titleId: string;
  title: string;
  initialRating: number | null;
}) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const lastSavedRef = useRef<number | null>(initialRating);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  async function save(next: number | null) {
    const previous = lastSavedRef.current;
    setError(false);
    try {
      const res = await fetch(`/api/titles/${titleId}/rating`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
      if (!res.ok) throw new Error("Failed to save rating");
      lastSavedRef.current = next;
    } catch {
      setRating(previous);
      setError(true);
    }
  }

  function onChange(next: number | null) {
    setRating(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => save(next), SAVE_DEBOUNCE_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={rating != null ? `Your rating ${rating.toFixed(1)}. Change rating` : "Rate this title"}
        className="flex min-w-0 flex-1 items-center justify-between gap-1 px-2.5 py-2 text-left active:bg-panel"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">You</span>
          <span className="flex min-h-[22px] items-center text-sm font-bold">
            {rating != null ? `★ ${rating.toFixed(1)}` : <span className="text-ink-soft">Rate</span>}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0" />
      </button>

      <BottomSheet open={open} onClose={close} title={title}>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Your rating</p>
        <RatingControl value={rating} onChange={onChange} />
        {error && <p className="mt-1 text-[10px] text-ink-soft">That didn&rsquo;t save — try again.</p>}
        <button
          type="button"
          onClick={close}
          className="hard-shadow-sm mt-4 flex h-11 w-full items-center justify-center border-[3px] border-ink bg-ink text-xs font-bold uppercase tracking-wide text-paper transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          Done
        </button>
      </BottomSheet>
    </>
  );
}
