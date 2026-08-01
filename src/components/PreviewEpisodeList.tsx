"use client";

import { useMemo, useState } from "react";
import FillerTag, { type FillerType } from "@/components/FillerTag";

export interface PreviewEpisode {
  episodeNumber: number;
  absoluteNumber: number | null;
  name: string | null;
  airLabel: string | null;
  overview: string | null;
  fillerType?: FillerType;
}

export interface PreviewSeasonGroup {
  seasonNumber: number;
  episodes: PreviewEpisode[];
}

// Read-only counterpart to EpisodeSection for the live preview page — the
// title isn't tracked yet, so there's no titleId/episode ids to hang watch
// ticks off of. Same season dropdown + click-to-expand overview UX, minus
// any state that would need a database round trip.
export default function PreviewEpisodeList({
  seasons,
}: {
  seasons: PreviewSeasonGroup[];
}) {
  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    seasons[0]?.seasonNumber ?? null,
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  const activeSeason = useMemo(
    () => seasons.find((s) => s.seasonNumber === selectedSeason) ?? seasons[0],
    [seasons, selectedSeason],
  );

  if (seasons.length === 0) {
    return (
      <p className="card-bold mt-3 px-4 py-6 text-center text-sm text-ink-soft">
        No episode data yet.
      </p>
    );
  }

  if (!activeSeason) return null;

  const SCROLL_THRESHOLD = 8;
  const needsScroll = activeSeason.episodes.length > SCROLL_THRESHOLD;

  return (
    <div className="mt-3">
      {seasons.length > 1 && (
        <div className="mb-2 flex justify-end">
          <select
            value={activeSeason.seasonNumber}
            onChange={(e) => setSelectedSeason(Number(e.target.value))}
            aria-label="Select season"
            className="hard-shadow-sm border-[3px] border-ink bg-paper px-2 py-1 text-xs font-bold uppercase tracking-wide"
          >
            {seasons.map((s) => (
              <option key={s.seasonNumber} value={s.seasonNumber}>
                Season {s.seasonNumber}
              </option>
            ))}
          </select>
        </div>
      )}

      <ul
        className={`card-bold divide-y-[3px] divide-ink p-0 ${
          needsScroll ? "max-h-[26rem] overflow-y-auto" : ""
        }`}
      >
        {activeSeason.episodes.map((ep) => {
          const key = `${activeSeason.seasonNumber}-${ep.episodeNumber}`;
          // Season is already implied by the dropdown/header above, so this
          // stays just "E{n}" for every media type — same as TV.
          const epLabel = `E${ep.episodeNumber}`;
          const isExpanded = expanded === key;
          return (
            <li key={key} className="px-3 py-2">
              <button
                type="button"
                aria-expanded={isExpanded}
                onClick={() => setExpanded((prev) => (prev === key ? null : key))}
                className="flex w-full items-center gap-1.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold uppercase tracking-wide">
                    {epLabel}
                    {ep.name ? ` · ${ep.name}` : ""}
                  </p>
                  {ep.airLabel && (
                    <p className="text-[10px] text-ink-soft">{ep.airLabel}</p>
                  )}
                </div>
                {ep.fillerType && <FillerTag type={ep.fillerType} />}
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-ink-soft transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>
              {isExpanded && (
                <div className="mt-2 border-t-[3px] border-ink pt-2">
                  <p className="text-xs leading-relaxed text-ink-soft">
                    {ep.overview && ep.overview.trim().length > 0
                      ? ep.overview
                      : "No description available."}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
