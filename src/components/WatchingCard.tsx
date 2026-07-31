"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ProgressBar from "@/components/ProgressBar";

// Everything the Home page's server component already knows about a single
// "currently watching" title, pre-computed there (progress counts + which
// episode a tap should mark) so this client component stays dumb about SQL.
export interface WatchingCardData {
  titleId: string;
  title: string;
  posterUrl: string | null;
  watchedCount: number;
  totalCount: number;
  nextEpisodeAirDate: string | null;
  nextEpisodeLabel: string | null;
  // The earliest aired-but-unwatched episode's id, or null when there isn't
  // one — i.e. the finale-guard case ("All caught up").
  nextUnwatchedEpisodeId: string | null;
}

function formatAirDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function WatchingCard({ data }: { data: WatchingCardData }) {
  const router = useRouter();
  // "justMarked" is a purely optimistic flag: true from the moment the POST
  // succeeds until the server-refreshed `data` prop arrives. The Home page
  // keys this component by `${titleId}:${watchedCount}:${nextUnwatchedEpisodeId}`,
  // so once that refresh lands React remounts the card fresh (new key) —
  // no effect needed to reset local state back to the real prop values.
  const [justMarked, setJustMarked] = useState(false);
  const [pending, setPending] = useState(false);
  const [showStamp, setShowStamp] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const caughtUp = !data.nextUnwatchedEpisodeId || justMarked;
  const displayedCount = data.watchedCount + (justMarked ? 1 : 0);
  const airDateLabel = formatAirDate(data.nextEpisodeAirDate);

  async function handleMark() {
    if (!data.nextUnwatchedEpisodeId || pending || justMarked) return;
    setPending(true);
    try {
      const res = await fetch(
        `/api/episodes/${data.nextUnwatchedEpisodeId}/watch`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Failed to mark episode watched");

      setJustMarked(true);
      setShowStamp(true);
      setShowToast(true);
      setTimeout(() => setShowStamp(false), 700);

      // Give the user a 4s Undo window before pulling fresh server state
      // (which will hand back the next unwatched episode, if any).
      refreshTimer.current = setTimeout(() => {
        setShowToast(false);
        router.refresh();
      }, 4000);
    } catch {
      // Leave the button enabled so the user can just try again.
    } finally {
      setPending(false);
    }
  }

  async function handleUndo() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const episodeId = data.nextUnwatchedEpisodeId;
    setShowToast(false);
    if (!episodeId) return;
    try {
      await fetch(`/api/episodes/${episodeId}/watch`, { method: "DELETE" });
    } finally {
      setJustMarked(false);
      router.refresh();
    }
  }

  return (
    <div className="card-bold relative flex gap-3 p-3">
      <Link
        href={`/title/${data.titleId}`}
        className="h-24 w-16 shrink-0 overflow-hidden rounded-md border-[3px] border-ink bg-panel"
      >
        {data.posterUrl ? (
          <img
            src={data.posterUrl}
            alt={data.title}
            className="h-full w-full object-cover"
          />
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div>
          <Link href={`/title/${data.titleId}`} className="block">
            <h3 className="display truncate text-lg">{data.title}</h3>
          </Link>
          <div className="mt-1">
            <ProgressBar watched={displayedCount} total={data.totalCount} />
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {airDateLabel
              ? `Next: ${data.nextEpisodeLabel ?? "Episode"} · ${airDateLabel}`
              : "No upcoming episode scheduled"}
          </p>
        </div>

        <motion.button
          type="button"
          onClick={handleMark}
          disabled={caughtUp || pending}
          whileTap={caughtUp || pending ? undefined : { scale: 0.94 }}
          animate={showStamp ? { scale: [1, 1.06, 1] } : { scale: 1 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className={`hard-shadow-sm mt-2 w-full border-[3px] border-ink px-3 py-2 text-xs font-bold uppercase tracking-wide transition-colors disabled:opacity-50 ${
            caughtUp ? "bg-panel text-ink-soft" : "bg-acid text-ink"
          }`}
        >
          {caughtUp ? "All caught up" : pending ? "Marking…" : "Mark Watched"}
        </motion.button>
      </div>

      <AnimatePresence>
        {showStamp && (
          <motion.span
            initial={{ opacity: 0, scale: 0.4, rotate: -14 }}
            animate={{ opacity: 1, scale: 1, rotate: -8 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="stamp pointer-events-none absolute right-3 top-3 text-sm"
          >
            +1 EP
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="hard-shadow-sm absolute -bottom-3 left-3 right-3 z-10 flex items-center justify-between border-[3px] border-ink bg-ink px-3 py-2"
          >
            <span className="text-xs font-bold uppercase tracking-wide text-paper">
              Marked watched
            </span>
            <button
              type="button"
              onClick={handleUndo}
              className="text-xs font-bold uppercase tracking-wide text-acid underline"
            >
              Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
