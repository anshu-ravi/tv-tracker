"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import ProgressBar from "@/components/ProgressBar";
import FillerTag, { type FillerType } from "@/components/FillerTag";
import BottomSheet from "@/components/BottomSheet";
import { AccountRow } from "@/components/account/AccountList";
import { TvIcon } from "@/components/icons";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";

// One "currently watching" title, pre-computed by the Home page.
export interface WatchingCardData {
  titleId: string;
  title: string;
  posterUrl: string | null;
  watchedCount: number;
  totalCount: number;
  seasonNumber: number | null;
  seasonWatchedCount: number | null;
  seasonTotalCount: number | null;
  // Null when there's nothing aired left to mark (finale guard).
  nextUnwatchedEpisodeId: string | null;
  nextEpisodeCode: string | null;
  nextEpisodeName: string | null;
  nextEpisodeFillerType?: FillerType;
  nextEpisodeOverview: string | null;
  nextEpisodeAirDate: string | null;
  bucket: "upnext" | "catchup";
}

export interface HomeToast {
  message: string;
  onUndo?: () => void;
}

export const UNDO_MS = 4000;

function formatAirDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Round acid check button: punches on mark, pops a "+1 EP" stamp, shakes when caught up.
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
      // Re-keying replays the keyframes even when the target values repeat.
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
      {caughtUp && !justMarked ? (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-ink-soft" strokeWidth={3.2}>
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

export default function WatchingCard({
  data,
  priority = false,
  notify,
}: {
  data: WatchingCardData;
  priority?: boolean;
  notify: (toast: HomeToast) => void;
}) {
  const router = useRouter();
  // Optimistic: set on tap, cleared on failure; a successful refresh remounts the card (keyed on counts).
  const [justMarked, setJustMarked] = useState(false);
  const [pending, setPending] = useState(false);
  const [popCount, setPopCount] = useState(0);
  const [shakeCount, setShakeCount] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Undo waits on this so a fast DELETE can't land before the POST.
  const postPromiseRef = useRef<Promise<Response> | null>(null);

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  const caughtUp = !data.nextUnwatchedEpisodeId || justMarked;
  const bump = justMarked ? 1 : 0;
  const hasSeasonProgress = data.seasonTotalCount !== null && data.seasonWatchedCount !== null;
  const watched = (hasSeasonProgress ? (data.seasonWatchedCount as number) : data.watchedCount) + bump;
  const total = hasSeasonProgress ? (data.seasonTotalCount as number) : data.totalCount;
  const seasonLabel = hasSeasonProgress ? `S${data.seasonNumber}` : undefined;
  const headline = data.nextEpisodeName ?? data.nextEpisodeCode ?? "";

  async function handleUndo() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const episodeId = data.nextUnwatchedEpisodeId;
    if (!episodeId) return;
    if (postPromiseRef.current) await postPromiseRef.current.catch(() => undefined);
    try {
      await fetch(`/api/episodes/${episodeId}/watch`, { method: "DELETE" });
    } finally {
      setJustMarked(false);
      router.refresh();
    }
  }

  function handleMark() {
    if (!data.nextUnwatchedEpisodeId || pending || justMarked) return;
    const episodeId = data.nextUnwatchedEpisodeId;

    setPending(true);
    setJustMarked(true);
    setPopCount((n) => n + 1);
    notify({ message: `Marked ${data.nextEpisodeCode ?? "watched"}`, onUndo: () => void handleUndo() });

    // Pull the next episode only once the Undo window has closed.
    refreshTimer.current = setTimeout(() => router.refresh(), UNDO_MS);

    const postPromise = fetch(`/api/episodes/${episodeId}/watch`, { method: "POST" });
    postPromiseRef.current = postPromise;
    postPromise
      .then((res) => {
        if (!res.ok) throw new Error("Failed to mark episode watched");
      })
      .catch(() => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        setJustMarked(false);
        notify({ message: "Couldn't mark watched — try again" });
      })
      .finally(() => {
        setPending(false);
        postPromiseRef.current = null;
      });
  }

  function handleButtonClick() {
    if (caughtUp) {
      setShakeCount((n) => n + 1);
      notify({ message: "You're all caught up" });
      return;
    }
    handleMark();
  }

  return (
    <div className="flex items-center gap-3 border-2 border-ink bg-paper p-2.5">
      <Link
        href={`/title/${data.titleId}`}
        className="relative h-[114px] w-[76px] shrink-0 overflow-hidden border-2 border-ink bg-panel"
      >
        {data.posterUrl ? (
          <Image
            src={buildTmdbImageUrl(data.posterUrl, 152)}
            alt={data.title}
            fill
            sizes="76px"
            className="object-cover"
            priority={priority}
            unoptimized
          />
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          href={`/title/${data.titleId}`}
          className="truncate text-[10px] font-extrabold uppercase tracking-wide text-ink-soft"
        >
          {data.title}
        </Link>
        {caughtUp && !justMarked ? (
          <p className="display text-base leading-tight">All caught up</p>
        ) : (
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex min-w-0 flex-col gap-1 text-left"
          >
            <span className="display line-clamp-2 text-base leading-tight">{headline}</span>
            {data.nextEpisodeName && (
              <span className="flex items-center gap-1.5 text-[11px] font-extrabold">
                {data.nextEpisodeCode}
                {data.nextEpisodeFillerType && <FillerTag type={data.nextEpisodeFillerType} quiet />}
              </span>
            )}
          </button>
        )}
        <div className="mt-0.5">
          <ProgressBar watched={watched} total={total} seasonLabel={seasonLabel} />
        </div>
      </div>

      <MarkButton
        caughtUp={caughtUp}
        pending={pending}
        justMarked={justMarked}
        shakeCount={shakeCount}
        popCount={popCount}
        onClick={handleButtonClick}
      />

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={data.title}>
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          <span>
            {data.nextEpisodeCode}
            {data.nextEpisodeAirDate ? ` · Aired ${formatAirDate(data.nextEpisodeAirDate)}` : ""}
          </span>
          {data.nextEpisodeFillerType && <FillerTag type={data.nextEpisodeFillerType} quiet />}
        </p>
        <h3 className="display mt-1 text-xl leading-tight">{headline}</h3>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          {data.nextEpisodeOverview?.trim() ? data.nextEpisodeOverview : "No description available."}
        </p>
        <button
          type="button"
          onClick={() => {
            setSheetOpen(false);
            handleMark();
          }}
          disabled={caughtUp}
          className="hard-shadow-sm mt-4 w-full border-[3px] border-ink bg-acid px-3 py-2.5 text-sm font-extrabold uppercase tracking-wide active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
        >
          Mark {data.nextEpisodeCode} watched
        </button>
        <div className="mt-4 border-2 border-ink">
          <AccountRow
            href={`/title/${data.titleId}`}
            icon={<TvIcon className="h-5 w-5" />}
            title="Open title"
            subtitle={`${seasonLabel ? `${seasonLabel} · ` : ""}${watched} / ${total} watched`}
          />
        </div>
      </BottomSheet>
    </div>
  );
}
