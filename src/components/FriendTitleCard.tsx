"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";
import type { FriendCardTitle } from "@/lib/friendProfile";
import type { WatchStatus } from "@/lib/types";

const STATUS_LABEL: Record<WatchStatus, string> = {
  watching: "Watching",
  watchlist: "On your list",
  completed: "You've seen it",
  dnf: "You dropped it",
};

// Poster tile on a friend's profile: their rating/progress, plus either your own
// status for this title or a one-tap "+ Watchlist".
export default function FriendTitleCard({
  title,
  myStatus,
  muted = false,
}: {
  title: FriendCardTitle;
  myStatus: WatchStatus | null;
  muted?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<WatchStatus | null>(myStatus);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function addToWatchlist() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: title.source,
          sourceId: title.sourceId,
          mediaType: title.mediaType,
          status: "watchlist",
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("watchlist");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`card-bold relative flex flex-col p-0 ${muted ? "opacity-60 grayscale-[35%]" : ""}`}>
      <Link href={`/title/${title.id}`}>
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-t-[11px] border-b-[3px] border-ink bg-panel">
          {title.posterUrl ? (
            <Image
              src={buildTmdbImageUrl(title.posterUrl, 280)}
              alt={title.title}
              fill
              sizes="(max-width: 640px) 33vw, 200px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2 text-center">
              <span className="display text-sm leading-tight text-ink-soft">{title.title}</span>
            </div>
          )}
          {title.rating !== null && (
            <span className="absolute right-1.5 top-1.5 rotate-3 border-2 border-ink bg-acid px-1.5 py-0.5 text-[10px] font-bold">
              ★ {title.rating.toFixed(1)}
            </span>
          )}
          {title.progress && (
            <span className="absolute bottom-1.5 left-1.5 border-2 border-ink bg-paper px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide">
              {title.progress}
            </span>
          )}
        </div>
        <p className="truncate px-1.5 pt-1 text-[10px] font-bold uppercase tracking-wide">
          {title.title}
        </p>
      </Link>
      <div className="px-1.5 pb-1.5 pt-0.5">
        {status ? (
          <p className="truncate text-[9px] font-bold uppercase tracking-wide text-ink-soft">
            {STATUS_LABEL[status]}
          </p>
        ) : (
          <button
            type="button"
            onClick={addToWatchlist}
            disabled={pending}
            className="w-full border-2 border-ink bg-paper py-0.5 text-[9px] font-bold uppercase tracking-wide transition-colors active:bg-acid disabled:opacity-50"
          >
            {pending ? "Adding…" : failed ? "Retry" : "+ Watchlist"}
          </button>
        )}
      </div>
    </div>
  );
}
