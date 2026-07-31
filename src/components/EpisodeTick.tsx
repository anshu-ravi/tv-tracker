"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// One episode row's tick control. Optimistic: flips immediately, calls the
// existing per-episode watch endpoint, then router.refresh() to pull the
// real server state (mirrors TitleActions' pattern). Reverts on failure.
export default function EpisodeTick({
  episodeId,
  initiallyWatched,
}: {
  episodeId: string;
  initiallyWatched: boolean;
}) {
  const router = useRouter();
  const [watched, setWatched] = useState(initiallyWatched);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !watched;
    setWatched(next);
    setPending(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/watch`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error("Failed to update episode");
      router.refresh();
    } catch {
      setWatched(!next); // revert the optimistic flip
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={watched}
      aria-label={watched ? "Mark episode unwatched" : "Mark episode watched"}
      className={`hard-shadow-sm flex h-6 w-6 shrink-0 items-center justify-center border-[3px] border-ink text-xs font-bold transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50 ${
        watched ? "bg-acid text-ink" : "bg-paper text-ink-soft"
      }`}
    >
      {watched ? "✓" : ""}
    </button>
  );
}
