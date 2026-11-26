"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshIcon } from "@/components/icons";
import { RowBody, rowClass } from "@/components/account/AccountList";

export interface LastRefreshRun {
  finishedAt: string;
  errorCount: number;
}

function formatRun(run: LastRefreshRun): string {
  const when = new Date(run.finishedAt)
    .toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .replace(" at ", ", ");
  return run.errorCount > 0 ? `Last run ${when} · ${run.errorCount} failed` : `Last run ${when}`;
}

// Settings row that re-fetches every tracked title from TMDB; the subtitle shows the latest cron run.
export default function RefreshTrackedButton({ lastRun }: { lastRun: LastRefreshRun | null }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onClick() {
    if (running) return;
    setRunning(true);
    setMessage(null);
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
      const data = (await res.json()) as { refreshed: number; failed: number };
      setMessage(
        data.failed > 0
          ? `Refreshed ${data.refreshed}, ${data.failed} failed`
          : `Refreshed ${data.refreshed} title${data.refreshed === 1 ? "" : "s"}`,
      );
      router.refresh();
    } catch {
      setMessage("Couldn't refresh — try again");
    } finally {
      setRunning(false);
    }
  }

  const subtitle = running
    ? "Refreshing — this can take a bit…"
    : (message ?? (lastRun ? formatRun(lastRun) : "Not refreshed yet"));

  return (
    <button type="button" onClick={onClick} disabled={running} className={`${rowClass} disabled:opacity-70`}>
      <RowBody
        icon={<RefreshIcon className={`h-5 w-5 ${running ? "animate-spin" : ""}`} />}
        title="Refresh data"
        subtitle={<span suppressHydrationWarning>{subtitle}</span>}
        trailing={<span />}
      />
    </button>
  );
}
