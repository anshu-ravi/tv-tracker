"use client";

import { motion } from "framer-motion";
import PosterCard, { type PosterCardTitle } from "@/components/PosterCard";

// Horizontally-swipeable poster carousel for the Watchlist screen — one per
// media_type ("TV" / "Anime"). Cards are noticeably bigger than the tiny
// 3-col grid tiles (BucketSection/BucketedGridPage) so ~2.2 posters show at
// once and it reads as a carousel, not a grid. Native horizontal scrolling
// with CSS scroll-snap drives the swipe — reliable on touch devices, unlike
// a Framer Motion drag gesture nested inside a vertically-scrollable page.
// Each card still gets a staggered entrance animation via Framer Motion.
export default function WatchlistCarousel({
  heading,
  titles,
  isFirstSection = false,
}: {
  heading: string;
  titles: PosterCardTitle[];
  // True only for the first non-empty carousel on the page (TV vs Anime) —
  // ~2.2 cards of that one carousel sit above the fold; a second carousel
  // further down the page never does, even though it's the same layout.
  isFirstSection?: boolean;
}) {
  if (titles.length === 0) return null;

  return (
    <section className="py-4">
      <div className="mb-3 flex items-baseline gap-2 px-4">
        <h2 className="display text-xl">{heading}</h2>
        <span className="stamp text-[10px]">{titles.length}</span>
      </div>

      <div
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {titles.map((title, i) => (
          <motion.div
            key={title.id}
            className="w-[42vw] max-w-[168px] shrink-0 snap-start"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.36, delay: i * 0.06, ease: [0.2, 0.9, 0.25, 1] }}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.97 }}
          >
            <PosterCard
              title={title}
              status="watchlist"
              priority={isFirstSection && i < 2}
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
