"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";
import { saveWithRetry } from "@/lib/rateSession";
import type { ResolveQueueItem } from "@/lib/resolveQueue";

const ANSWERED_KEY = "resolve-titles-answered-v2";

function readAnswered(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(ANSWERED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

// One-card-at-a-time "did you watch the latest season?" flow, modelled on
// RateStack: an answer saves in the background and the next card shows
// straight away.
export default function ResolveStack({ queue }: { queue: ResolveQueueItem[] }) {
  const router = useRouter();
  // Kept in sessionStorage because Back restores this page from the router
  // cache with the queue it had when first loaded.
  const [answered, setAnswered] = useState<string[]>(readAnswered);
  const [failedCount, setFailedCount] = useState(0);
  const [leaving, setLeaving] = useState(false);

  const remaining = queue.filter((item) => !answered.includes(item.titleId));
  const current = remaining[0];
  const finished = remaining.length === 0;

  // Back restores a cached copy of this page; refetch so a title ticked off
  // on its own page (the "Partly" route) drops out of the queue.
  useEffect(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!finished) return;
    try {
      window.sessionStorage.removeItem(ANSWERED_KEY);
    } catch {
      // Nothing to clear without storage.
    }
  }, [finished]);

  function setAnsweredFor(titleId: string, isAnswered: boolean) {
    setAnswered((prev) => {
      const next = isAnswered ? [...prev, titleId] : prev.filter((id) => id !== titleId);
      try {
        window.sessionStorage.setItem(ANSWERED_KEY, JSON.stringify(next));
      } catch {
        // Private mode: the in-memory list still covers this visit.
      }
      return next;
    });
  }

  async function save(titleId: string, watched: boolean): Promise<boolean> {
    const ok = await saveWithRetry(async () => {
      const res = await fetch(`/api/titles/${titleId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ watched }),
      });
      // 404 means it was already resolved elsewhere, which is the outcome we wanted.
      return res.ok || res.status === 404;
    });
    if (!ok) {
      setFailedCount((n) => n + 1);
      // Put it back in the queue so the answer isn't silently lost.
      setAnsweredFor(titleId, false);
    }
    return ok;
  }

  function answer(watched: boolean) {
    if (!current) return;
    const isLast = remaining.length === 1;
    setAnsweredFor(current.titleId, true);
    // Refresh after the last save so Account's badge and Home pick up the answers.
    void save(current.titleId, watched).then(() => {
      if (isLast) router.refresh();
    });
  }

  // "Partly" opens the title page without answering: the title stays in this
  // queue until an episode of that season is ticked (a DB trigger clears it).
  function answerPartly() {
    if (!current) return;
    setLeaving(true);
    router.push(`/title/${current.titleId}`);
  }

  if (!current) {
    return (
      <div className="card-bold flex flex-col items-center gap-4 p-8 text-center">
        <span className="stamp text-lg">All done</span>
        <p className="text-sm text-ink-soft">
          {queue.length === 0 ? "Nothing to resolve right now." : "That's every title sorted."}
        </p>
        {failedCount > 0 && (
          <p className="text-sm font-bold">
            {failedCount} answer{failedCount === 1 ? "" : "s"} didn&rsquo;t save. Those titles will
            show up here again.
          </p>
        )}
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
        {remaining.length} left
      </p>

      <div className="card-bold flex flex-col gap-4 p-4">
        <div className="relative mx-auto aspect-[2/3] w-full max-w-[260px] overflow-hidden border-[3px] border-ink bg-panel">
          {current.posterUrl ? (
            <Image
              src={buildTmdbImageUrl(current.posterUrl, 500)}
              alt={current.title}
              fill
              sizes="260px"
              className="object-cover"
              unoptimized
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-1 text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            {current.title} · {current.mediaType}
          </p>
          <h2 className="display text-2xl leading-tight">
            Did you watch season {current.seasonNumber}?
          </h2>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => answer(false)}
            disabled={leaving}
            className="hard-shadow border-[3px] border-ink bg-paper px-6 py-4 text-sm font-bold uppercase tracking-wide disabled:opacity-50"
          >
            No
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            disabled={leaving}
            className="hard-shadow border-[3px] border-ink bg-acid px-6 py-4 text-sm font-bold uppercase tracking-wide disabled:opacity-50"
          >
            Yes
          </button>
        </div>
        <button
          type="button"
          onClick={answerPartly}
          disabled={leaving}
          className="hard-shadow-sm border-[3px] border-ink bg-paper px-6 py-2.5 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
        >
          {leaving ? "Opening…" : "Partly — let me tick episodes"}
        </button>
      </div>
    </div>
  );
}
