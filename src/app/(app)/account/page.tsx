import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import ProfileEditor from "@/components/ProfileEditor";
import RefreshTrackedButton from "@/components/RefreshTrackedButton";
import { type LastRefreshedRunSummary } from "@/components/LastRefreshedTag";

interface RefreshRunRow {
  finished_at: string;
  error_count: number;
}

function toSummary(row: RefreshRunRow | null): LastRefreshedRunSummary | null {
  return row ? { finishedAt: row.finished_at, errorCount: row.error_count } : null;
}

// Account screen — profile (display name + avatar, stored in Supabase Auth
// user_metadata) plus identity + sign out, moved here from the app-shell
// header. Future home for per-user stats (shows tracked, episodes watched).
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName: string = user?.user_metadata?.display_name ?? "";
  const avatarUrl: string | null = user?.user_metadata?.avatar_url ?? null;
  const initial = (displayName || user?.email || "?").charAt(0).toUpperCase();

  // Most recent run per scope (supabase/functions/refresh-air-dates), so the
  // owner can tell at a glance whether both the nightly ("running") and
  // weekly ("all") cron jobs are actually running — see
  // supabase/migrations/*_refresh_runs.sql. Two schedules means one "last
  // refreshed" reading would be ambiguous, so each scope is fetched and
  // shown separately.
  const [
    { data: latestRunningRun, error: latestRunningRunError },
    { data: latestAllRun, error: latestAllRunError },
  ] = await Promise.all([
    supabase
      .from("refresh_runs")
      .select("finished_at, error_count")
      .eq("scope", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("refresh_runs")
      .select("finished_at, error_count")
      .eq("scope", "all")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestRunningRunError) throw latestRunningRunError;
  if (latestAllRunError) throw latestAllRunError;

  const lastRunningRun = toSummary(latestRunningRun as RefreshRunRow | null);
  const lastAllRun = toSummary(latestAllRun as RefreshRunRow | null);

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Account</h1>

      <div className="card-bold flex items-center gap-3 p-4">
        {avatarUrl ? (
          <div className="relative h-14 w-14 shrink-0 overflow-hidden border-[3px] border-ink bg-panel">
            <Image src={avatarUrl} alt="Profile photo" fill sizes="56px" className="object-cover" />
          </div>
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center border-[3px] border-ink bg-acid">
            <span className="display text-xl">{initial}</span>
          </div>
        )}
        <div className="min-w-0">
          {displayName ? (
            <p className="truncate text-sm font-bold">{displayName}</p>
          ) : (
            <p className="truncate text-sm font-bold text-ink-soft">No display name set</p>
          )}
          <p className="truncate text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            {user?.email}
          </p>
        </div>
      </div>

      {user && (
        <ProfileEditor
          initialDisplayName={displayName}
          initialAvatarUrl={avatarUrl}
        />
      )}

      <div className="card-bold mt-3 flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            Signed in as
          </p>
          <p className="truncate text-sm font-bold">{user?.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="hard-shadow-sm border-[3px] border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            Sign out
          </button>
        </form>
      </div>

      <RefreshTrackedButton lastRunningRun={lastRunningRun} lastAllRun={lastAllRun} />

      <Link
        href="/account/rate"
        className="card-bold mt-3 flex items-center justify-between gap-3 p-4 transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        <p className="text-sm font-bold uppercase tracking-wide">Rate Your Titles</p>
        <span className="display text-lg">→</span>
      </Link>

      <Link
        href="/account/stats"
        className="card-bold mt-3 flex items-center justify-between gap-3 bg-acid p-4 transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        <p className="text-sm font-bold uppercase tracking-wide">View Your Stats</p>
        <span className="display text-lg">→</span>
      </Link>
    </div>
  );
}
