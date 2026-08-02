"use client";

export interface LastRefreshedRunSummary {
  finishedAt: string;
  errorCount: number;
}

// "Last refreshed" tag for the Account tab — shows when the nightly
// refresh-air-dates Edge Function (supabase/functions/refresh-air-dates)
// last ran, so the owner can tell at a glance whether the cron job is
// actually firing. Reads the most recent supabase/migrations/*_refresh_runs.sql
// row, passed down from the server component.
//
// A client component because the timestamp must render in the viewer's local
// time — server-rendering it would bake in the server's timezone (UTC on
// Vercel), not the owner's. The date is computed directly in render (not via
// an effect + setState, which would cascade a render for no benefit — this
// component is client-only content, not something that needs to match
// server-rendered markup byte-for-byte) and `suppressHydrationWarning` covers
// the one line where the server's placeholder render and the client's
// locale-formatted render legitimately differ.
export default function LastRefreshedTag({
  run,
}: {
  run: LastRefreshedRunSummary | null;
}) {
  if (!run) {
    return (
      <div className="stamp mt-3 self-start text-[11px]">
        Not refreshed yet
      </div>
    );
  }

  const label = new Date(run.finishedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const hasErrors = run.errorCount > 0;

  return (
    <div className="stamp mt-3 self-start text-[11px]" suppressHydrationWarning>
      Last refreshed: {label}
      {hasErrors && (
        <span className="ml-1 text-red-600">
          — {run.errorCount} error{run.errorCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
