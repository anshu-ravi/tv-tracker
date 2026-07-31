"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WatchStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: WatchStatus; label: string }[] = [
  { value: "watchlist", label: "Watchlist" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dnf", label: "DNF" },
];

// Small edit controls overlaid on a poster tile: a status <select> to move
// the title between buckets, and a ✕ to remove it from the library
// entirely. Both hit the existing/new API routes then router.refresh() so
// the server-rendered grids (Watchlist/TV/Anime) pick up the change.
export default function TitleActions({
  titleId,
  status,
}: {
  titleId: string;
  status: WatchStatus;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleStatusChange(next: WatchStatus) {
    setPending(true);
    try {
      const res = await fetch(`/api/titles/${titleId}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm("Remove this title from your library?")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/titles/${titleId}`, { method: "DELETE" });
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="flex items-center gap-1 border-t-[3px] border-ink bg-paper px-1.5 py-1"
      // Stop taps here from bubbling to any future card-level link/click.
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={status}
        disabled={pending}
        onChange={(e) => handleStatusChange(e.target.value as WatchStatus)}
        aria-label="Change bucket"
        className="min-w-0 flex-1 border-[3px] border-ink bg-paper px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide disabled:opacity-50"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleRemove}
        disabled={pending}
        aria-label="Remove from library"
        className="hard-shadow-sm shrink-0 border-[3px] border-ink bg-paper px-1.5 py-0.5 text-[10px] font-bold text-ink transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
      >
        ✕
      </button>
    </div>
  );
}
