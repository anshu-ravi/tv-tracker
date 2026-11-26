"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useRouter } from "next/navigation";

interface WatchedEpisodesValue {
  watched: Set<string>;
  pendingEpisodeIds: Set<string>;
  toggleEpisode: (episodeId: string) => Promise<void>;
  setWatched: React.Dispatch<React.SetStateAction<Set<string>>>;
}

const WatchedEpisodesContext = createContext<WatchedEpisodesValue | null>(null);

// One source of truth for a title's watched episodes, shared by the Up next card and the episode list.
export function WatchedEpisodesProvider({
  initialWatchedIds,
  children,
}: {
  initialWatchedIds: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [watched, setWatched] = useState<Set<string>>(() => new Set(initialWatchedIds));
  const [pendingEpisodeIds, setPendingEpisodeIds] = useState<Set<string>>(() => new Set());

  const toggleEpisode = useCallback(
    async (episodeId: string) => {
      if (pendingEpisodeIds.has(episodeId)) return;
      const willWatch = !watched.has(episodeId);
      const flip = (add: boolean) =>
        setWatched((prev) => {
          const next = new Set(prev);
          if (add) next.add(episodeId);
          else next.delete(episodeId);
          return next;
        });

      flip(willWatch);
      setPendingEpisodeIds((prev) => new Set(prev).add(episodeId));
      try {
        const res = await fetch(`/api/episodes/${episodeId}/watch`, {
          method: willWatch ? "POST" : "DELETE",
        });
        if (!res.ok) throw new Error("Failed to update episode");
      } catch {
        flip(!willWatch);
      } finally {
        setPendingEpisodeIds((prev) => {
          const next = new Set(prev);
          next.delete(episodeId);
          return next;
        });
        // A tick can move the title's status server-side; pull it into the action bar.
        router.refresh();
      }
    },
    [pendingEpisodeIds, watched, router],
  );

  return (
    <WatchedEpisodesContext.Provider value={{ watched, pendingEpisodeIds, toggleEpisode, setWatched }}>
      {children}
    </WatchedEpisodesContext.Provider>
  );
}

export function useWatchedEpisodes(): WatchedEpisodesValue {
  const value = useContext(WatchedEpisodesContext);
  if (!value) throw new Error("useWatchedEpisodes must be used inside WatchedEpisodesProvider");
  return value;
}
