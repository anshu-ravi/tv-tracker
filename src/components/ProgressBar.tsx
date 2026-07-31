"use client";

import { motion } from "framer-motion";

export interface ProgressBarProps {
  /** Episodes watched so far (already includes any optimistic +1). */
  watched: number;
  /** Total episodes for the title. May be 0 if not yet known. */
  total: number;
  /** Whether the fill should spring to its new width (vs. snap instantly). */
  animate?: boolean;
}

// Bold-styled horizontal progress track: hard 3px ink border, paper/panel
// track, acid-green fill that springs to its new width. Used on Home's
// "currently watching" cards to show watchedCount / totalCount.
export default function ProgressBar({ watched, total, animate = true }: ProgressBarProps) {
  const hasTotal = total > 0;
  const pct = hasTotal ? Math.min(100, Math.max(0, (watched / total) * 100)) : 0;
  const complete = hasTotal && watched >= total;

  return (
    <div className="flex flex-col gap-1">
      <div className="hard-shadow-sm h-3 w-full overflow-hidden border-[3px] border-ink bg-panel">
        <motion.div
          className={`h-full ${complete ? "bg-ink" : "bg-acid"}`}
          initial={false}
          animate={{ width: hasTotal ? `${pct}%` : "0%" }}
          transition={
            animate
              ? { type: "spring", stiffness: 260, damping: 24 }
              : { duration: 0 }
          }
        />
      </div>
      <span className="text-xs font-semibold text-ink-soft">
        {hasTotal ? `${watched} / ${total}` : `${watched} ep watched`}
      </span>
    </div>
  );
}
