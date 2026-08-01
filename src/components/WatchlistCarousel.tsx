"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import PosterCard, { type PosterCardTitle } from "@/components/PosterCard";

// Horizontally-swipeable poster carousel for the Watchlist screen — one per
// media_type ("TV" / "Anime"). Cards are noticeably bigger than the tiny
// 3-col grid tiles (BucketSection/BucketedGridPage) so ~2.2 posters show at
// once and it reads as a carousel, not a grid. Drag-to-scroll is the star
// interaction; a thin acid progress bar reflects how far through the row
// the user has dragged.
export default function WatchlistCarousel({
  heading,
  titles,
}: {
  heading: string;
  titles: PosterCardTitle[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragConstraints, setDragConstraints] = useState({ left: 0, right: 0 });
  const [progress, setProgress] = useState(0);

  // Measure on mount / on resize / whenever the title count changes, so
  // drag can't fling the row past its actual content width.
  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    function measure() {
      if (!container || !track) return;
      const overflow = track.scrollWidth - container.clientWidth;
      setDragConstraints({ left: overflow > 0 ? -overflow : 0, right: 0 });
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(track);
    return () => observer.disconnect();
  }, [titles.length]);

  if (titles.length === 0) return null;

  const maxDrag = Math.abs(dragConstraints.left) || 1;

  return (
    <section className="py-4">
      <div className="mb-3 flex items-baseline gap-2 px-4">
        <h2 className="display text-xl">{heading}</h2>
        <span className="stamp text-[10px]">{titles.length}</span>
      </div>

      <div ref={containerRef} className="overflow-hidden px-4">
        <motion.div
          ref={trackRef}
          className="flex w-max gap-3"
          drag="x"
          dragConstraints={dragConstraints}
          dragElastic={0.15}
          dragTransition={{ power: 0.35, timeConstant: 220, bounceStiffness: 300, bounceDamping: 24 }}
          onDrag={(_, info) => {
            setProgress(Math.min(1, Math.max(0, -info.offset.x / maxDrag)));
          }}
          onDragEnd={(_, info) => {
            setProgress(Math.min(1, Math.max(0, -info.offset.x / maxDrag)));
          }}
        >
          {titles.map((title, i) => (
            <motion.div
              key={title.id}
              className="w-[42vw] max-w-[168px] shrink-0"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, delay: i * 0.06, ease: [0.2, 0.9, 0.25, 1] }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.97 }}
            >
              <PosterCard title={title} status="watchlist" />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {dragConstraints.left !== 0 && (
        <div className="mx-4 mt-3 h-1.5 overflow-hidden rounded-full border-2 border-ink bg-panel">
          <motion.div
            className="h-full bg-acid"
            style={{ width: `${12 + progress * 88}%` }}
            transition={{ type: "tween", duration: 0.1 }}
          />
        </div>
      )}
    </section>
  );
}
