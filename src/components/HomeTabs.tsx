"use client";

import { useState } from "react";
import WatchingCard, { type WatchingCardData } from "@/components/WatchingCard";
import UpcomingCard from "@/components/UpcomingCard";
import type { MediaType } from "@/lib/types";

// One title with a known future air date — either the next episode of a
// running show, or the premiere of a not-yet-aired watchlist title.
// Computed server-side in the Home page from `titles`/`user_titles`.
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

const TAB_LABEL: Record<Tab, string> = {
  watching: "Currently Watching",
  upcoming: "Upcoming",
};

// Home's client-side subtab switcher. Stays mounted across the router.refresh()
// triggered by a WatchingCard mark-watched, so the active tab survives that
// refresh instead of resetting to "Currently Watching" every time.
export default function HomeTabs({
  watching,
  upcoming,
}: {
  watching: WatchingCardData[];
  upcoming: UpcomingItem[];
}) {
  const [tab, setTab] = useState<Tab>("watching");

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Home</h1>

      <div className="mb-5 grid grid-cols-2 border-[3px] border-ink">
        {(Object.keys(TAB_LABEL) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-3 py-2.5 text-xs font-extrabold uppercase tracking-wide transition-colors duration-150 ${
              tab === key
                ? "bg-acid text-ink"
                : "bg-paper text-ink-soft"
            } ${key === "watching" ? "border-r-[3px] border-ink" : ""}`}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {tab === "watching" ? (
        watching.length === 0 ? (
          <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
            Nothing in progress. Add a show from Search to get started.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {watching.map((card) => (
              // Keyed on the mutable fields, not just titleId: when a mark
              // triggers router.refresh() and fresh props arrive, the key
              // changes and React remounts the card instead of carrying over
              // stale optimistic local state (see WatchingCard).
              <WatchingCard
                key={`${card.titleId}:${card.watchedCount}:${card.nextUnwatchedEpisodeId ?? "none"}`}
                data={card}
              />
            ))}
          </div>
        )
      ) : upcoming.length === 0 ? (
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          Nothing on the horizon. Running shows and unreleased watchlist titles will appear
          here.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {upcoming.map((item) => (
            <UpcomingCard key={item.titleId} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
