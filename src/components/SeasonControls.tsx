"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Mark season done" / "Unmark season" for a season header. Hits the bulk
// season-watch endpoint, then router.refresh() so every episode tick in the
// season (and the header itself) picks up the real state.
export default function SeasonControls({
  titleId,
  seasonNumber,
  allWatched,
}: {
  titleId: string;
  seasonNumber: number;
  allWatched: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(method: "POST" | "DELETE") {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(
        `/api/titles/${titleId}/season/${seasonNumber}/watch`,
        { method },
      );
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => run(allWatched ? "DELETE" : "POST")}
      disabled={pending}
      className="hard-shadow-sm border-[3px] border-ink bg-paper px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
    >
      {pending
        ? "Working…"
        : allWatched
          ? "Unmark season"
          : "Mark season done"}
    </button>
  );
}
