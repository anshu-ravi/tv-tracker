"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshIcon } from "@/components/icons";

interface RefreshOutcome {
  titleId: string;
  ok: boolean;
  title?: string;
  error?: string;
}

// "Refresh all tracked shows" — re-fetches every title the user has as
// watching/watchlist from its provider and re-upserts titles + episodes.
// Fixes catalog rows left incomplete by the one-time Trakt import (it only
// wrote episodes the user had already watched, so unwatched seasons are
// sometimes missing entirely). Can take a while for a large library, so the
// button disables itself and reports a summary rather than failing silently.
export default function RefreshTrackedButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (running) return;
    setRunning(true);
    setSummary(null);
    setError(null);
    try {
      const res = await fetch("/api/titles/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scope: "tracked" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Refresh failed");
      }
      const data = (await res.json()) as {
        results: RefreshOutcome[];
        refreshed: number;
        failed: number;
      };
      setSummary(
        data.failed > 0
          ? `Refreshed ${data.refreshed}, failed ${data.failed}.`
          : `Refreshed ${data.refreshed} title${data.refreshed === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch {
      setError("Couldn't refresh — try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="card-bold mt-3 flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide">Refresh tracked shows</p>
          <p className="text-[11px] text-ink-soft">
            Re-fetch watching &amp; watchlist titles from TMDB.
          </p>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={running}
          aria-label="Refresh all tracked shows"
          className="hard-shadow-sm flex h-11 w-11 shrink-0 items-center justify-center border-[3px] border-ink bg-paper transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          <RefreshIcon className={`h-5 w-5 ${running ? "animate-spin" : ""}`} />
        </button>
      </div>
      {running && <p className="text-[11px] text-ink-soft">Refreshing — this can take a bit…</p>}
      {summary && <p className="text-[11px] text-ink-soft">{summary}</p>}
      {error && <p className="text-[11px] text-ink-soft">{error}</p>}
    </div>
  );
}
