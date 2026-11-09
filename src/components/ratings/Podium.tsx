"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import type { RankedTitle } from "@/lib/ratingsRank";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";

const EASE = [0.2, 0.9, 0.25, 1] as const;

// Olympic order: 2nd left, 1st centre, 3rd right. Steps rise 3 → 2 → 1.
const SLOTS = [
  { place: 2, stepHeight: 52, delay: 0.15 },
  { place: 1, stepHeight: 84, delay: 0.3 },
  { place: 3, stepHeight: 34, delay: 0 },
] as const;

function stepColors(place: number, shame: boolean): string {
  if (shame) return place === 1 ? "bg-ink text-acid" : "bg-ink-soft text-paper";
  return place === 1 ? "bg-acid text-ink" : place === 2 ? "bg-panel text-ink" : "bg-paper text-ink";
}

// Top three titles standing on a stepped podium; `shame` restyles it for the bottom three.
export default function Podium({ titles, shame }: { titles: RankedTitle[]; shame: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_1.2fr_1fr] items-end gap-2">
      {SLOTS.map(({ place, stepHeight, delay }) => {
        const item = titles[place - 1];
        if (!item) return <div key={place} />;
        const isFirst = place === 1;
        return (
          <div key={place} className="flex min-w-0 flex-col">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: delay + 0.25, ease: EASE }}
            >
              <Link
                href={`/title/${item.titleId}`}
                className="block transition-transform active:translate-x-[2px] active:translate-y-[2px]"
              >
                <div className="card-bold relative overflow-hidden p-0">
                  <div className="relative aspect-[2/3] w-full bg-panel">
                    {item.posterUrl ? (
                      <Image
                        src={buildTmdbImageUrl(item.posterUrl, isFirst ? 342 : 300)}
                        alt={item.title}
                        fill
                        sizes={isFirst ? "140px" : "115px"}
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
                  <motion.span
                    className={`stamp absolute bottom-1.5 right-1.5 ${isFirst ? "text-base" : "text-xs"}`}
                    initial={isFirst ? { scale: 1.8, opacity: 0, rotate: -5 } : false}
                    animate={{ scale: 1, opacity: 1, rotate: -5 }}
                    transition={{ type: "spring", stiffness: 500, damping: 18, delay: 0.95 }}
                  >
                    {item.rating.toFixed(1)}★
                  </motion.span>
                </div>
                <p className="mb-1.5 mt-1.5 truncate text-center text-[10px] font-bold uppercase tracking-wide">
                  {item.title}
                </p>
              </Link>
            </motion.div>
            <motion.div
              className={`flex origin-bottom items-start justify-center border-[3px] border-ink pt-1 ${stepColors(place, shame)}`}
              style={{ height: stepHeight }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.35, delay, ease: EASE }}
            >
              <span className={`display ${isFirst ? "text-4xl" : "text-2xl"}`}>{place}</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
