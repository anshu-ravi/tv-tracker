"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ProgressBar from "@/components/ProgressBar";
import FillerTag, { type FillerType } from "@/components/FillerTag";

// Everything the Home page's server component already knows about a single
// "currently watching" title, pre-computed there (progress counts + which
// episode a tap should mark) so this client component stays dumb about SQL.
export interface WatchingCardData {
  titleId: string;
  title: string;
  posterUrl: string | null;
  watchedCount: number;
  totalCount: number;
  // Season-scoped counterparts to watchedCount/totalCount, computed
  // server-side for every media type (see the Home page): watched vs. total
  // episodes within the season of `nextEpisode`, so the card can show
  // "S3 · 5 / 8" instead of a series-wide total that spans every season. For
  // anime rows the TMDB migration hasn't reached yet, every episode is still
  // season 1, so this just reduces to "S1 · watchedCount / totalCount" — the
  // fields stay non-null either way now that anime has real seasons too.
  seasonNumber: number | null;
  seasonWatchedCount: number | null;
  seasonTotalCount: number | null;
  // The earliest aired-but-unwatched episode's id, or null when there isn't
  // one — i.e. the finale-guard case ("All caught up").
  nextUnwatchedEpisodeId: string | null;
  // Code + name for that same next-unwatched episode, e.g. "E5" / "Rescue
  // Rukia" (anime) or "S3E7" / "The Reunion" (TV). Null when there's no next
  // episode (caught up) or the episode has no name.
  nextEpisodeCode: string | null;
  nextEpisodeName: string | null;
  // Anime-only canon/filler/mixed tag for the next-up episode, from
  // animefillerlist.com — absent for TV or when there's no next episode/match.
  nextEpisodeFillerType?: FillerType;
  // Overview/synopsis text for the next-unwatched episode, shown in an
  // expandable panel on the card. Null when there's no next episode, or the
  // episode has no stored overview (common for anime).
  nextEpisodeOverview: string | null;
  // Air date (ISO) of the next-unwatched episode, or null if it has none.
  // Used server-side to classify the card into a sub-section, and here by
  // the Catch Up carousel to render "N weeks/months behind".
  nextEpisodeAirDate: string | null;
  // Which Currently Watching sub-section this card belongs in. The Home page
  // only ever builds cards for titles that still have a next-unwatched
  // episode (fully caught-up titles are dropped before reaching this
  // component), so this is always "upnext" or "catchup", never a
  // caught-up state.
  bucket: "upnext" | "catchup";
}

// Round check-circle mark button, matching the Bold prototype: 52px circle,
// acid fill / ink border+shadow, flips to ink-fill/acid-check mid "punch",
// pops a "+1 EP" badge that flies up out of the top, or — when there's
// nothing to mark — sits muted with a clock glyph and shakes on tap.
function MarkButton({
  caughtUp,
  pending,
  justMarked,
  shakeCount,
  popCount,
  onClick,
}: {
  caughtUp: boolean;
  pending: boolean;
  justMarked: boolean;
  shakeCount: number;
  popCount: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={caughtUp ? "All caught up" : "Mark episode watched"}
      aria-disabled={caughtUp}
      animate={
        justMarked
          ? { scale: [1, 0.72, 1.18, 1] }
          : shakeCount > 0
            ? { x: [0, -4, 4, 0] }
            : { scale: 1, x: 0 }
      }
      // Re-trigger the animate prop's keyframes each time these counters
      // change, even if the target values are structurally identical.
      key={`${justMarked ? "punch" : "idle"}-${shakeCount}`}
      transition={
        justMarked
          ? { duration: 0.48, times: [0, 0.35, 0.65, 1], ease: "easeOut" }
          : { duration: 0.38, ease: "easeInOut" }
      }
      whileTap={!caughtUp && !pending ? { scale: 0.94 } : undefined}
      className={`relative flex h-[52px] w-[52px] shrink-0 items-center justify-center self-center rounded-full border-[3px] border-ink transition-colors duration-150 ${
        justMarked
          ? "bg-ink shadow-[3px_3px_0_0_var(--color-ink)]"
          : caughtUp
            ? "cursor-default bg-panel opacity-70 shadow-[3px_3px_0_0_rgba(20,18,14,0.35)]"
            : "cursor-pointer bg-acid shadow-[3px_3px_0_0_var(--color-ink)]"
      }`}
    >
      {caughtUp ? (
        <svg
          viewBox="0 0 24 24"
          className="h-[22px] w-[22px] fill-none stroke-ink-soft"
          strokeWidth={3.2}
        >
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l3 2" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className={`h-[22px] w-[22px] fill-none ${justMarked ? "stroke-acid" : "stroke-ink"}`}
          strokeWidth={3.2}
        >
          <polyline points="4,13 9,18 20,6" />
        </svg>
      )}

      <AnimatePresence>
        {popCount > 0 && (
          <motion.span
            key={popCount}
            initial={{ opacity: 0, y: 4, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [4, -2, -6, -30], scale: [0.6, 1.08, 1, 0.9] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.9, times: [0, 0.2, 0.35, 1], ease: "easeOut" }}
            className="stamp pointer-events-none absolute -right-1.5 -top-2 text-[11px]"
          >
            +1 EP
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default function WatchingCard({ data }: { data: WatchingCardData }) {
  const router = useRouter();
  // "justMarked" is a purely optimistic flag: true from the moment the POST
  // succeeds until the server-refreshed `data` prop arrives. The Home page
  // keys this component by `${titleId}:${watchedCount}:${nextUnwatchedEpisodeId}`,
  // so once that refresh lands React remounts the card fresh (new key) —
  // no effect needed to reset local state back to the real prop values.
  const [justMarked, setJustMarked] = useState(false);
  const [pending, setPending] = useState(false);
  const [popCount, setPopCount] = useState(0);
  const [shakeCount, setShakeCount] = useState(0);
  const [toast, setToast] = useState<{ message: string; withUndo: boolean } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const realCaughtUp = !data.nextUnwatchedEpisodeId;
  const caughtUp = realCaughtUp || justMarked;
  const displayedCount = data.watchedCount + (justMarked ? 1 : 0);
  // Season-scoped display, TV only (seasonTotalCount is null for anime —
  // see WatchingCardData). The optimistic +1 from marking an episode
  // watched applies to the season count too, same as the overall one above.
  const hasSeasonProgress = data.seasonTotalCount !== null && data.seasonWatchedCount !== null;
  const displayedSeasonCount = hasSeasonProgress
    ? (data.seasonWatchedCount as number) + (justMarked ? 1 : 0)
    : displayedCount;
  const displayedTotalCount = hasSeasonProgress
    ? (data.seasonTotalCount as number)
    : data.totalCount;
  const seasonLabel = hasSeasonProgress ? `S${data.seasonNumber}` : undefined;

  function dismissToast() {
    setToast(null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }

  async function handleMark() {
    if (!data.nextUnwatchedEpisodeId || pending || justMarked) return;
    setPending(true);
    try {
      const res = await fetch(
        `/api/episodes/${data.nextUnwatchedEpisodeId}/watch`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error("Failed to mark episode watched");

      setJustMarked(true);
      setPopCount((n) => n + 1);
      setToast({ message: "Marked watched", withUndo: true });
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(dismissToast, 2500);

      // Give the user a 2.5s Undo window before pulling fresh server state
      // (which will hand back the next unwatched episode, if any).
      refreshTimer.current = setTimeout(() => {
        setToast(null);
        router.refresh();
      }, 2500);
    } catch {
      // Leave the button enabled so the user can just try again.
    } finally {
      setPending(false);
    }
  }

  function handleCaughtUpTap() {
    setShakeCount((n) => n + 1);
    setToast({ message: "You're all caught up", withUndo: false });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(dismissToast, 2500);
  }

  function handleButtonClick() {
    if (caughtUp) {
      handleCaughtUpTap();
      return;
    }
    void handleMark();
  }

  async function handleUndo() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const episodeId = data.nextUnwatchedEpisodeId;
    dismissToast();
    if (!episodeId) return;
    try {
      await fetch(`/api/episodes/${episodeId}/watch`, { method: "DELETE" });
    } finally {
      setJustMarked(false);
      router.refresh();
    }
  }

  return (
    <div className="card-bold relative flex items-start gap-3 p-3">
      <Link
        href={`/title/${data.titleId}`}
        className="h-24 w-16 shrink-0 overflow-hidden rounded-md border-[3px] border-ink bg-panel"
      >
        {data.posterUrl ? (
          <img
            src={data.posterUrl}
            alt={data.title}
            className="h-full w-full object-cover"
          />
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 self-center">
        <Link href={`/title/${data.titleId}`} className="block">
          <h3 className="display truncate text-lg">{data.title}</h3>
        </Link>
        <ProgressBar
          watched={displayedSeasonCount}
          total={displayedTotalCount}
          seasonLabel={seasonLabel}
        />
        {caughtUp ? (
          <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-soft">
            <span>All caught up</span>
          </p>
        ) : (
          <>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((prev) => !prev)}
              className="flex min-w-0 items-center gap-1.5 text-left text-xs font-semibold text-ink-soft"
            >
              <span className="min-w-0 truncate">
                Up next · {data.nextEpisodeCode}
                {data.nextEpisodeName ? ` · ${data.nextEpisodeName}` : ""}
              </span>
              {data.nextEpisodeFillerType && <FillerTag type={data.nextEpisodeFillerType} />}
              <span
                aria-hidden="true"
                className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>
            {expanded && (
              <div className="mt-2 border-t-[3px] border-ink pt-2">
                <p className="text-xs leading-relaxed text-ink-soft">
                  {data.nextEpisodeOverview && data.nextEpisodeOverview.trim().length > 0
                    ? data.nextEpisodeOverview
                    : "No description available."}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <MarkButton
        caughtUp={caughtUp}
        pending={pending}
        justMarked={justMarked}
        shakeCount={shakeCount}
        popCount={popCount}
        onClick={handleButtonClick}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.32, ease: [0.2, 0.9, 0.25, 1] }}
            className="absolute -bottom-3 left-3 right-3 z-10 flex items-center justify-between gap-3 border-[3px] border-ink bg-ink px-3 py-2 shadow-[4px_4px_0_0_rgba(199,255,62,0.9)]"
          >
            <span className="text-xs font-bold uppercase tracking-wide text-paper">
              {toast.message}
            </span>
            {toast.withUndo ? (
              <button
                type="button"
                onClick={handleUndo}
                className="shrink-0 border-2 border-acid px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide text-acid"
              >
                Undo
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
