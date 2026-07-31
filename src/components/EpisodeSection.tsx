"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import EpisodeTick from "@/components/EpisodeTick";
import SeasonControls from "@/components/SeasonControls";
import type { MediaType } from "@/lib/types";

export interface SeasonEpisode {
  id: string;
  episodeNumber: number;
  absoluteNumber: number | null;
  name: string | null;
  airLabel: string | null;
}

export interface SeasonGroup {
  seasonNumber: number;
  episodes: SeasonEpisode[];
}

// Owns the one source of truth for "which episodes are watched" across the
// whole episode list, plus which season is selected. Everything below (the
// season dropdown, the mark-season button, every tick) is a controlled
// child driven from this state — that's what makes "mark season done" tick
// every checkbox instantly instead of waiting on a router.refresh() that a
// child's own useState would ignore.
export default function EpisodeSection({
  titleId,
  mediaType,
  seasons,
  initialWatchedIds,
}: {
  titleId: string;
  mediaType: MediaType;
  seasons: SeasonGroup[];
  initialWatchedIds: string[];
}) {
  const router = useRouter();
  const [watched, setWatched] = useState<Set<string>>(
    () => new Set(initialWatchedIds),
  );
  const [seasonPending, setSeasonPending] = useState(false);
  const [pendingEpisodeIds, setPendingEpisodeIds] = useState<Set<string>>(
    () => new Set(),
  );

  const defaultSeason = useMemo(() => {
    const firstUnfinished = seasons.find((s) =>
      s.episodes.some((ep) => !initialWatchedIds.includes(ep.id)),
    );
    return (firstUnfinished ?? seasons[0])?.seasonNumber ?? null;
    // Only compute the initial default once — after that the dropdown is
    // user-controlled, so this intentionally ignores later watched changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedSeason, setSelectedSeason] = useState<number | null>(
    defaultSeason,
  );

  const activeSeason =
    seasons.find((s) => s.seasonNumber === selectedSeason) ?? seasons[0];

  async function toggleEpisode(episodeId: string) {
    if (pendingEpisodeIds.has(episodeId)) return;
    const willWatch = !watched.has(episodeId);

    setWatched((prev) => {
      const next = new Set(prev);
      if (willWatch) next.add(episodeId);
      else next.delete(episodeId);
      return next;
    });
    setPendingEpisodeIds((prev) => new Set(prev).add(episodeId));

    try {
      const res = await fetch(`/api/episodes/${episodeId}/watch`, {
        method: willWatch ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error("Failed to update episode");
    } catch {
      // Roll back the optimistic flip.
      setWatched((prev) => {
        const next = new Set(prev);
        if (willWatch) next.delete(episodeId);
        else next.add(episodeId);
        return next;
      });
      router.refresh();
    } finally {
      setPendingEpisodeIds((prev) => {
        const next = new Set(prev);
        next.delete(episodeId);
        return next;
      });
    }
  }

  async function toggleSeason() {
    if (seasonPending || !activeSeason) return;
    const episodeIds = activeSeason.episodes.map((ep) => ep.id);
    const allWatched =
      episodeIds.length > 0 && episodeIds.every((id) => watched.has(id));
    const markAsWatched = !allWatched;

    const previousWatched = new Set(watched);
    setWatched((prev) => {
      const next = new Set(prev);
      for (const id of episodeIds) {
        if (markAsWatched) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    setSeasonPending(true);

    try {
      const res = await fetch(
        `/api/titles/${titleId}/season/${activeSeason.seasonNumber}/watch`,
        { method: markAsWatched ? "POST" : "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to update season");
    } catch {
      setWatched(previousWatched); // roll back the whole-season optimistic update
      router.refresh();
    } finally {
      setSeasonPending(false);
    }
  }

  if (seasons.length === 0) {
    return (
      <p className="card-bold mt-3 px-4 py-6 text-center text-sm text-ink-soft">
        No episode data yet.
      </p>
    );
  }

  if (!activeSeason) return null;

  const allWatchedInSeason =
    activeSeason.episodes.length > 0 &&
    activeSeason.episodes.every((ep) => watched.has(ep.id));
  const isAnime = mediaType === "anime";

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {isAnime || seasons.length <= 1 ? (
          <h3 className="display text-base">Episodes</h3>
        ) : (
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
        )}
        <SeasonControls
          allWatched={allWatchedInSeason}
          pending={seasonPending}
          onToggle={toggleSeason}
        />
      </div>

      <ul className="card-bold divide-y-[3px] divide-ink p-0">
        {activeSeason.episodes.map((ep) => {
          const epLabel = isAnime
            ? `E${ep.absoluteNumber ?? ep.episodeNumber}`
            : `E${ep.episodeNumber}`;
          return (
            <li key={ep.id} className="flex items-center gap-3 px-3 py-2">
              <EpisodeTick
                watched={watched.has(ep.id)}
                pending={pendingEpisodeIds.has(ep.id)}
                onToggle={() => toggleEpisode(ep.id)}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold uppercase tracking-wide">
                  {epLabel}
                  {ep.name ? ` · ${ep.name}` : ""}
                </p>
                {ep.airLabel && (
                  <p className="text-[10px] text-ink-soft">{ep.airLabel}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
