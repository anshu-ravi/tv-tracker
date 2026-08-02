"use client";

export interface LastRefreshedRunSummary {
  finishedAt: string;
  errorCount: number;
}

// "Last refreshed" footnote for the Account tab's "Refresh tracked shows"
// card — shows when the refresh-air-dates Edge Function
// (supabase/functions/refresh-air-dates) last ran each scope, so the owner
// can tell at a glance whether both cron jobs are actually firing. Reads the
// most recent supabase/migrations/*_refresh_runs.sql row per scope, passed
// down from the server component.
//
// Two schedules (nightly "running", weekly "all") mean a single "last
// refreshed" reading is ambiguous — a fresh nightly row says nothing about
// whether the weekly full sweep is healthy. Both are surfaced, each labeled
// with its scope, rather than picking one.
//
// This is quiet, secondary metadata — a passive "when did the robot last
// run" readout, not a primary action. It intentionally avoids the rotated
// `.stamp` treatment and the acid-green accent color used elsewhere on this
// screen (Save profile, View your stats): spending the accent on a passive
// timestamp would devalue it. The one exception is a failing run
// (error_count > 0), which stays visually loud so a silently-broken weekly
// sweep can't hide behind healthy-looking styling.
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
  const date = new Date(run.finishedAt);
  const label = date
    .toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    // Some locales insert "at" between date and time (e.g. "2 Aug at 13:13");
    // drop it to keep this a single tight fragment.
    .replace(" at ", ", ");
  return { label, hasErrors: run.errorCount > 0 };
}

// Single-line subtext rendered beneath the description inside the
// "Refresh tracked shows" card: "Daily: 2 Aug, 13:13 | Weekly: 2 Aug, 12:37".
// Uses flex-wrap (not a hard nowrap) so on a narrow phone the two scopes can
// drop to their own line instead of overflowing the card or colliding with
// the refresh icon button — the card's flex row already gives this column
// `min-w-0` for that to work.
export default function LastRefreshedTag({
  runningRun,
  allRun,
}: {
  runningRun: LastRefreshedRunSummary | null;
  allRun: LastRefreshedRunSummary | null;
}) {
  if (!runningRun && !allRun) {
    return (
      <p className="text-[10px] uppercase tracking-wide text-ink-soft">
        Not refreshed yet
      </p>
    );
  }

  return (
    <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[10px] uppercase tracking-wide text-ink-soft">
      <RunFragment scopeLabel="Daily" run={runningRun} />
      <span aria-hidden="true" className="text-ink-soft/50">
        |
      </span>
      <RunFragment scopeLabel="Weekly" run={allRun} />
    </p>
  );
}

function RunFragment({
  scopeLabel,
  run,
}: {
  scopeLabel: string;
  run: LastRefreshedRunSummary | null;
}) {
  if (!run) {
    return <span>{scopeLabel}: not refreshed yet</span>;
  }

  const { label, hasErrors } = formatRun(run);

  return (
    <span
      className={hasErrors ? "font-bold text-red-600" : undefined}
      suppressHydrationWarning
    >
      {scopeLabel}: {label}
      {hasErrors && (
        <>
          {" "}
          — {run.errorCount} error{run.errorCount === 1 ? "" : "s"}
        </>
      )}
    </span>
  );
}
