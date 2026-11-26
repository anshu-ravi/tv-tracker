"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWatchedEpisodes } from "@/components/WatchedEpisodes";
import type { WatchStatus } from "@/lib/types";

export interface UpNextEpisode {
  id: string;
  code: string;
  name: string | null;
  aired: boolean;
}

const UNDO_MS = 4000;

// The next aired, unwatched episode with a one-tap mark; falls back to the next air date when caught up.
export default function UpNextCard({
  status,
  episodes,
  upcoming,
}: {
  status: WatchStatus | null;
  episodes: UpNextEpisode[];
  upcoming: { label: string; date: string } | null;
}) {
  const { watched, pendingEpisodeIds, toggleEpisode } = useWatchedEpisodes();
  const [lastMarked, setLastMarked] = useState<UpNextEpisode | null>(null);
  const [popCount, setPopCount] = useState(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const next = status === "watching" ? episodes.find((e) => e.aired && !watched.has(e.id)) : undefined;

  function mark() {
    if (!next || pendingEpisodeIds.has(next.id)) return;
    void toggleEpisode(next.id);
    setLastMarked(next);
    setPopCount((c) => c + 1);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setLastMarked(null), UNDO_MS);
  }

  function undo() {
    if (!lastMarked) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (watched.has(lastMarked.id)) void toggleEpisode(lastMarked.id);
    setLastMarked(null);
  }

  if (!next && !lastMarked && !upcoming) return null;

  return (
    <section className="mx-4 mt-4">
      <div className="hard-shadow flex items-center gap-3 border-[3px] border-ink bg-paper px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {next ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Up next</p>
              <p className="display mt-1 text-base">{next.code}</p>
              {next.name && <p className="mt-0.5 truncate text-xs text-ink-soft">{next.name}</p>}
            </>
          ) : upcoming ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                Next episode · {upcoming.date}
              </p>
              <p className="display mt-1 text-base">{upcoming.label}</p>
            </>
          ) : (
            <p className="display text-base">All caught up</p>
          )}
        </div>

        {next && (
          <motion.button
            type="button"
            onClick={mark}
            disabled={pendingEpisodeIds.has(next.id)}
            aria-label={`Mark ${next.code} watched`}
            key={popCount}
            animate={popCount > 0 ? { scale: [1, 0.8, 1.12, 1] } : undefined}
            transition={{ duration: 0.4, times: [0, 0.35, 0.65, 1], ease: "easeOut" }}
            className="hard-shadow-sm relative shrink-0 border-[3px] border-ink bg-acid px-3 py-2 text-xs font-bold uppercase tracking-wide active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
          >
            +1 EP
            <AnimatePresence>
              {popCount > 0 && (
                <motion.span
                  key={popCount}
                  initial={{ opacity: 0, y: 4, scale: 0.6 }}
                  animate={{ opacity: [0, 1, 1, 0], y: [4, -4, -10, -30], scale: [0.6, 1.08, 1, 0.9] }}
                  transition={{ duration: 0.9, times: [0, 0.2, 0.35, 1], ease: "easeOut" }}
                  className="stamp pointer-events-none absolute -right-2 -top-3 text-[11px]"
                >
                  +1 EP
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </div>

      {lastMarked && (
        <p className="mt-2 flex items-center justify-between border-2 border-ink bg-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-paper">
          <span>Marked {lastMarked.code}</span>
          <button type="button" onClick={undo} className="text-acid underline underline-offset-2">
            Undo
          </button>
        </p>
      )}
    </section>
  );
}
