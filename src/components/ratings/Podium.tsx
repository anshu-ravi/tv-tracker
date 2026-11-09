"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import type { RankedTitle } from "@/lib/ratingsRank";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";

const EASE = [0.2, 0.9, 0.25, 1] as const;

// Olympic order: 2nd left, 1st centre, 3rd right. Steps rise 3 → 2 → 1.
const SLOTS = [
  { place: 2, label: "2nd", height: 88, delay: 0.15, edge: "border-r-0" },
  { place: 1, label: "1st", height: 116, delay: 0.3, edge: "" },
  { place: 3, label: "3rd", height: 64, delay: 0, edge: "border-l-0" },
] as const;

const PODIUM_COLORS = {
  1: "bg-gold text-ink",
  2: "bg-silver text-ink",
  3: "bg-bronze text-ink",
} as const;

const SHAME_COLORS = {
  1: "bg-ink text-acid",
  2: "bg-[#2b2621] text-paper",
  3: "bg-ink-soft text-paper",
} as const;

// Faint diagonal hatch plus a darker lip along the top edge, so each step reads as a solid block.
const STEP_TEXTURE = {
  backgroundImage:
    "linear-gradient(to bottom, rgba(20,17,14,0.22) 0 7px, transparent 7px), repeating-linear-gradient(135deg, rgba(20,17,14,0.07) 0 2px, transparent 2px 8px)",
};

// Top three titles standing on one connected podium; `shame` restyles it for the bottom three.
export default function Podium({ titles, shame }: { titles: RankedTitle[]; shame: boolean }) {
  const colors = shame ? SHAME_COLORS : PODIUM_COLORS;

  return (
    <div className="mt-2 flex items-end pr-1">
      {SLOTS.map(({ place, label, height, delay, edge }) => {
        const item = titles[place - 1];
        const isFirst = place === 1;
        return (
          <div key={place} className={`flex min-w-0 flex-1 flex-col ${isFirst ? "z-10" : ""}`}>
            {item && (
              <motion.div
                className="relative px-2 pb-2"
                initial={{ opacity: 0, y: -28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: delay + 0.3, ease: EASE }}
              >
                <Link
                  href={`/title/${item.titleId}`}
                  className="block transition-transform active:translate-x-[2px] active:translate-y-[2px]"
                >
                  <div className="card-bold relative overflow-hidden p-0">
                    <div className="relative aspect-[2/3] w-full bg-panel">
                      {item.posterUrl ? (
                        <Image
                          src={buildTmdbImageUrl(item.posterUrl, 300)}
                          alt={item.title}
                          fill
                          sizes="110px"
                          className={`object-cover ${shame ? "grayscale-[40%]" : ""}`}
                          priority
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center p-2 text-center">
                          <span className="display text-sm text-ink-soft">{item.title}</span>
                        </div>
                      )}
                    </div>
                    <span className="stamp absolute bottom-1.5 right-1.5 text-xs">{item.rating.toFixed(1)}★</span>
                  </div>
                </Link>
              </motion.div>
            )}
            <motion.div
              className={`flex origin-bottom flex-col items-center justify-start border-[3px] border-ink px-1 pt-2.5 hard-shadow ${edge} ${colors[place as 1 | 2 | 3]}`}
              style={{ height, ...STEP_TEXTURE }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, delay, ease: EASE }}
            >
              <span className={`display leading-none ${isFirst ? "text-4xl" : "text-2xl"}`}>{label}</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
