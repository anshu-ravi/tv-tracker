"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PosterCard, { type PosterCardTitle } from "@/components/PosterCard";

// A poster tile for a list detail page's grid: the plain PosterCard (links
// to /title/:id) plus a small "remove from this list" ✕ overlaid in the
// corner. The button sits outside PosterCard's own <Link> as a sibling, so
// it intercepts the tap instead of triggering navigation — no
// stopPropagation needed.
export default function ListTitleCard({
  listId,
  title,
  priority = false,
}: {
  listId: string;
  title: PosterCardTitle;
  priority?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function handleRemove() {
    setPending(true);
    try {
      const res = await fetch(`/api/lists/${listId}/titles/${title.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove from list");
      setRemoved(true);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (removed) return null;

  return (
    <div className="relative">
      <PosterCard title={title} priority={priority} />
      <button
        type="button"
        onClick={handleRemove}
        disabled={pending}
        aria-label="Remove from this list"
        className="hard-shadow-sm absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center border-[2.5px] border-ink bg-paper text-xs font-bold text-ink transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
      >
        ✕
      </button>
    </div>
  );
}
