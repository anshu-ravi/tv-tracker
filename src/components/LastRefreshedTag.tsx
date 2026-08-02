"use client";

export interface LastRefreshedRunSummary {
  finishedAt: string;
  errorCount: number;
}

// "Last refreshed" tag for the Account tab — shows when the refresh-air-dates
// Edge Function (supabase/functions/refresh-air-dates) last ran each scope,
// so the owner can tell at a glance whether both cron jobs are actually
// firing. Reads the most recent supabase/migrations/*_refresh_runs.sql row
// per scope, passed down from the server component.
//
// Two schedules (nightly "running", weekly "all") mean a single "last
// refreshed" reading is ambiguous — a fresh nightly row says nothing about
// whether the weekly full sweep is healthy. Both are surfaced, each labeled
// with its scope, rather than picking one.
//
// A client component because the timestamps must render in the viewer's
// local time — server-rendering them would bake in the server's timezone
// (UTC on Vercel), not the owner's. The dates are computed directly in
// render (not via an effect + setState, which would cascade a render for no
// benefit — this component is client-only content, not something that needs
// to match server-rendered markup byte-for-byte) and `suppressHydrationWarning`
// covers the lines where the server's placeholder render and the client's
// locale-formatted render legitimately differ.
function formatRun(run: LastRefreshedRunSummary): { label: string; hasErrors: boolean } {
  const label = new Date(run.finishedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return { label, hasErrors: run.errorCount > 0 };
}

export default function LastRefreshedTag({
  runningRun,
  allRun,
}: {
  runningRun: LastRefreshedRunSummary | null;
  allRun: LastRefreshedRunSummary | null;
}) {
  if (!runningRun && !allRun) {
    return (
      <div className="stamp mt-3 self-start text-[11px]">
        Not refreshed yet
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-1.5">
      <RunLine scopeLabel="Nightly" run={runningRun} />
      <RunLine scopeLabel="Weekly" run={allRun} />
    </div>
  );
}

function RunLine({
  scopeLabel,
  run,
}: {
  scopeLabel: string;
  run: LastRefreshedRunSummary | null;
}) {
  if (!run) {
    return (
      <div className="stamp self-start text-[11px]">
        {scopeLabel}: not refreshed yet
      </div>
    );
  }

  const { label, hasErrors } = formatRun(run);

  return (
    <div className="stamp self-start text-[11px]" suppressHydrationWarning>
      {scopeLabel}: {label}
      {hasErrors && (
        <span className="ml-1 text-red-600">
          — {run.errorCount} error{run.errorCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}
