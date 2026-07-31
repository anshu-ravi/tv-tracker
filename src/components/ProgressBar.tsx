"use client";

import { motion } from "framer-motion";

export interface ProgressBarProps {
  /** Episodes watched so far (already includes any optimistic +1). */
  watched: number;
  /** Total episodes for the title. May be 0 if not yet known. */
  total: number;
  /** Whether the fill should animate to its new width (vs. snap instantly). */
  animate?: boolean;
}

// Bold-styled thin horizontal progress track, matching the prototype:
// a hairline (2px border, ~10px tall) bar with an ink fill that eases to
// its new width, and the "watched / total" label sitting to its LEFT.
export default function ProgressBar({ watched, total, animate = true }: ProgressBarProps) {
  const hasTotal = total > 0;
  const pct = hasTotal ? Math.min(100, Math.max(0, (watched / total) * 100)) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="whitespace-nowrap text-[11.5px] font-extrabold text-ink">
        {hasTotal ? `${watched} / ${total}` : `${watched} ep watched`}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden border-2 border-ink bg-panel">
        <motion.div
          className="h-full bg-ink"
          initial={false}
          animate={{ width: hasTotal ? `${pct}%` : "0%" }}
          transition={
            animate
              ? { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }
              : { duration: 0 }
          }
        />
      </div>
    </div>
  );
}
