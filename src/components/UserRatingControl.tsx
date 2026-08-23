"use client";

import { useEffect, useRef, useState } from "react";
import RatingControl from "@/components/RatingControl";

// A burst of -/+ nudges fires many onChange calls in quick succession; only
// the settled value needs to reach the network.
const SAVE_DEBOUNCE_MS = 500;

// The owner's own rating on a tracked title, distinct from RatingBadges
// (external IMDb/RT scores just below it) -- this one persists, those don't.
// Optimistic write with rollback on failure, same pattern as
// EpisodeSection's mark-watched toggle. Saves are debounced so a burst of
// adjustments produces one PATCH instead of one per step.
export default function UserRatingControl({
  titleId,
  initialRating,
}: {
  titleId: string;
  initialRating: number | null;
}) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [error, setError] = useState(false);
  const lastSavedRef = useRef<number | null>(initialRating);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Your rating</p>
      <RatingControl value={rating} onChange={onChange} />
      {error && <p className="text-[10px] text-ink-soft">That didn&rsquo;t save — try again.</p>}
    </div>
  );
}
