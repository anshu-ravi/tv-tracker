"use client";

import { useMemo, useState } from "react";
import ListTitleCard from "@/components/ListTitleCard";
import type { PosterCardTitle } from "@/components/PosterCard";
import type { MediaType } from "@/lib/types";

const FILTERS: { value: MediaType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
  { value: "movie", label: "Movie" },
];

// The media-type-filterable title grid for a list detail page (including
// Favorites). Lives client-side purely for the `useState` filter — the
// server page still does the actual data fetch and hands down every title
// in the list; this just decides which of them are currently shown.
export default function ListTitlesView({
  listId,
  titles,
}: {
  listId: string;
  titles: PosterCardTitle[];
}) {
  const [filter, setFilter] = useState<MediaType | "all">("all");

  const filtered = useMemo(
    () => (filter === "all" ? titles : titles.filter((t) => t.mediaType === filter)),
    [titles, filter],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`hard-shadow-sm border-[3px] border-ink px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${
              filter === f.value ? "bg-acid" : "bg-paper"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {titles.length === 0 ? (
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          Nothing in this list yet.
        </p>
      ) : filtered.length === 0 ? (
        <p className="card-bold px-4 py-8 text-center text-sm text-ink-soft">
          Nothing in this filter.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {filtered.map((title, index) => (
            <ListTitleCard
              key={title.id}
              listId={listId}
              title={title}
              // Only the first row (3-col grid) is above the fold on a
              // phone, and only on the initial "All" view — once the user
              // taps a filter it's a post-load interaction, not the page's
              // LCP candidate.
              priority={filter === "all" && index < 3}
            />
          ))}
        </div>
      )}
    </div>
  );
}
