"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import WatchingCard, { UNDO_MS, type HomeToast, type WatchingCardData } from "@/components/WatchingCard";
import UpcomingCard from "@/components/UpcomingCard";
import CatchUpCarousel from "@/components/CatchUpCarousel";
import { THIS_WEEK_DAYS } from "@/lib/upcomingDate";
import type { MediaType } from "@/lib/types";

// A title with a known future air date: a running show's next episode or an unreleased premiere.
export interface UpcomingItem {
  titleId: string;
  title: string;
  posterUrl: string | null;
  mediaType: MediaType;
  airDate: string;
  daysUntil: number;
  episodeLabel: string | null;
}

type Tab = "watching" | "upcoming";

const sectionLabel = "mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft";

function UpcomingGroup({ label, items, highlightFirst }: { label: string; items: UpcomingItem[]; highlightFirst: boolean }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className={sectionLabel}>{label}</h2>
      <div className="divide-y-2 divide-ink border-2 border-ink bg-paper">
        {items.map((item, i) => (
          <UpcomingCard key={item.titleId} item={item} highlight={highlightFirst && i === 0} />
        ))}
      </div>
    </section>
  );
}

// Home's Watching / Upcoming switcher. Stays mounted across router.refresh(), so the tab survives a mark.
export default function HomeTabs({
  watching,
  upcoming,
  displayName = "",
}: {
  watching: WatchingCardData[];
  upcoming: UpcomingItem[];
  displayName?: string;
}) {
  const [tab, setTab] = useState<Tab>("watching");
  const [toast, setToast] = useState<(HomeToast & { id: number }) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const notify = useCallback((next: HomeToast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ ...next, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), UNDO_MS);
  }, []);

  function undo() {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toast?.onUndo?.();
    setToast(null);
  }

  const upNext = watching.filter((card) => card.bucket === "upnext");
  const catchUp = watching.filter((card) => card.bucket === "catchup");
  const thisWeek = upcoming.filter((item) => item.daysUntil < THIS_WEEK_DAYS);
  const later = upcoming.filter((item) => item.daysUntil >= THIS_WEEK_DAYS);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "watching", label: "Watching", count: watching.length },
    { key: "upcoming", label: "Upcoming", count: upcoming.length },
  ];

  return (
    <div className="px-4 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="display text-2xl">Home</h1>
        {displayName ? (
          <p className="truncate text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
            Hey, {displayName}
          </p>
        ) : null}
      </div>

      <div className="mb-5 mt-3 grid grid-cols-2 border-[3px] border-ink">
        {tabs.map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors duration-150 ${
              tab === key ? "bg-ink text-paper" : "bg-paper text-ink-soft"
            } ${key === "watching" ? "border-r-[3px] border-ink" : ""}`}
          >
            {label} <span className={tab === key ? "text-acid" : ""}>{count}</span>
          </button>
        ))}
      </div>

      {tab === "watching" ? (
        watching.length === 0 ? (
          <p className="border-2 border-ink px-4 py-8 text-center text-sm text-ink-soft">
            Nothing in progress. Add a show from Explore to get started. Shows you&rsquo;re fully
            caught up on move to Upcoming once their next episode is scheduled.
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {upNext.length > 0 && (
              <section>
                <h2 className={sectionLabel}>Up next</h2>
                <div className="flex flex-col gap-3">
                  {upNext.map((card, index) => (
                    // Keyed on mutable fields so a refresh remounts the card and drops stale optimistic state.
                    <WatchingCard
                      key={`${card.titleId}:${card.watchedCount}:${card.nextUnwatchedEpisodeId ?? "none"}`}
                      data={card}
                      priority={index === 0}
                      notify={notify}
                    />
                  ))}
                </div>
              </section>
            )}

            {catchUp.length > 0 && (
              <div className="flex flex-col gap-3">
                <h2 className="stamp w-fit text-xs">Catch Up</h2>
                <CatchUpCarousel items={catchUp} isFirstSection={upNext.length === 0} />
              </div>
            )}
          </div>
        )
      ) : upcoming.length === 0 ? (
        <p className="border-2 border-ink px-4 py-8 text-center text-sm text-ink-soft">
          Nothing on the horizon. Running shows and unreleased watchlist titles will appear here.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <UpcomingGroup label="This week" items={thisWeek} highlightFirst />
          <UpcomingGroup label="Later" items={later} highlightFirst={thisWeek.length === 0} />
        </div>
      )}

      <div className="pointer-events-none sticky bottom-3 z-20 mt-4">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              role="status"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25, ease: [0.2, 0.9, 0.25, 1] }}
              className="pointer-events-auto flex items-center justify-between gap-3 border-[3px] border-ink bg-ink px-3 py-2 shadow-[4px_4px_0_0_rgba(199,255,62,0.9)]"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-paper">{toast.message}</span>
              {toast.onUndo ? (
                <button
                  type="button"
                  onClick={undo}
                  className="shrink-0 border-2 border-acid px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-acid"
                >
                  Undo
                </button>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
