"use client";

import { useState } from "react";
import RatingControl from "@/components/RatingControl";

// The owner's own rating on a tracked title, distinct from RatingBadges
// (external IMDb/RT scores just below it) -- this one persists, those don't.
// Optimistic write with rollback on failure, same pattern as
// EpisodeSection's mark-watched toggle.
export default function UserRatingControl({
  titleId,
  initialRating,
}: {
  titleId: string;
  initialRating: number | null;
}) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [error, setError] = useState(false);

  async function commit(next: number | null) {
    const previous = rating;
    setRating(next);
    setError(false);
    try {
      const res = await fetch(`/api/titles/${titleId}/rating`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating: next }),
      });
      if (!res.ok) throw new Error("Failed to save rating");
    } catch {
      setRating(previous);
      setError(true);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Your rating</p>
      <RatingControl value={rating} onChange={commit} />
      {error && <p className="text-[10px] text-ink-soft">That didn&rsquo;t save — try again.</p>}
    </div>
  );
}
