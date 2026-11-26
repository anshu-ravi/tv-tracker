import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import ProfileHeader from "@/components/ProfileHeader";
import RefreshTrackedButton, { type LastRefreshRun } from "@/components/RefreshTrackedButton";
import StatsStrip, { StatsStripFallback } from "@/components/account/StatsStrip";
import StreamingSubtitle from "@/components/account/StreamingSubtitle";
import { AccountGroup, AccountRow, RowBody, rowClass } from "@/components/account/AccountList";
import { CardsIcon, LogOutIcon, StarIcon, TvIcon, UsersIcon } from "@/components/icons";
import { parseWatchSettings } from "@/lib/watchSettings";

// Account tab: profile, headline stats, and links to the per-user sub-pages.
export default async function AccountPage() {
  const supabase = await createClient();
  // getClaims() verifies the JWT locally; user_metadata and email are standard claims.
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  const userId = claims?.sub ?? "";
  const email: string = claims?.email ?? "";
  const displayName: string = claims?.user_metadata?.display_name ?? "";
  const avatarUrl: string | null = claims?.user_metadata?.avatar_url ?? null;
  const watchSettings = parseWatchSettings(claims?.user_metadata);

  const [lastRunRes, resolveRes, requestRes, ratingsRes, friendsRes, profileRes] = await Promise.all([
    supabase
      .from("refresh_runs")
      .select("finished_at, error_count")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("user_titles")
      .select("id", { count: "exact", head: true })
      .not("pending_season_check", "is", null),
    supabase.from("friend_requests").select("id", { count: "exact", head: true }).eq("recipient_id", userId),
    supabase.from("user_titles").select("rating").not("rating", "is", null),
    supabase.from("friendships").select("user_a", { count: "exact", head: true }),
    supabase.from("profiles").select("handle").eq("id", userId).maybeSingle(),
  ]);

  for (const res of [lastRunRes, resolveRes, requestRes, ratingsRes, friendsRes, profileRes]) {
    if (res.error) throw res.error;
  }

  const lastRunRow = lastRunRes.data as { finished_at: string; error_count: number } | null;
  const lastRun: LastRefreshRun | null = lastRunRow
    ? { finishedAt: lastRunRow.finished_at, errorCount: lastRunRow.error_count }
    : null;
  const pendingResolve = resolveRes.count ?? 0;
  const friendRequests = requestRes.count ?? 0;
  const friendCount = friendsRes.count ?? 0;
  const handle = (profileRes.data as { handle: string } | null)?.handle ?? null;

  const ratings = ((ratingsRes.data ?? []) as { rating: number | string }[]).map((r) => Number(r.rating));
  const ratingsSubtitle = ratings.length
    ? `${ratings.length} rated · avg ${(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)}`
    : "Nothing rated yet";

  return (
    <div className="px-4 py-6">
      <ProfileHeader displayName={displayName} handle={handle} avatarUrl={avatarUrl} email={email} />

      <Suspense fallback={<StatsStripFallback />}>
        <StatsStrip />
      </Suspense>

      {pendingResolve > 0 && (
        <Link
          href="/account/resolve"
          className="mt-4 flex items-center justify-between gap-3 border-[3px] border-ink bg-ink px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-paper"
        >
          <span>
            {pendingResolve} title{pendingResolve === 1 ? "" : "s"} to resolve
          </span>
          <span className="text-acid">→</span>
        </Link>
      )}

      <AccountGroup label="You">
        <AccountRow href="/account/ratings" icon={<StarIcon className="h-5 w-5" />} title="Your ratings" subtitle={ratingsSubtitle} />
        <AccountRow href="/account/rate" icon={<CardsIcon className="h-5 w-5" />} title="Rate titles" subtitle="Quick-fire your unrated titles" />
        <AccountRow
          href="/account/friends"
          icon={<UsersIcon className="h-5 w-5" />}
          title="Friends"
          subtitle={friendCount === 0 ? "Add a friend" : `${friendCount} friend${friendCount === 1 ? "" : "s"}`}
          badge={friendRequests}
        />
      </AccountGroup>

      <AccountGroup label="Settings">
        <AccountRow
          href="/account/streaming"
          icon={<TvIcon className="h-5 w-5" />}
          title="Streaming"
          subtitle={
            <Suspense fallback="…">
              <StreamingSubtitle settings={watchSettings} />
            </Suspense>
          }
        />
        <RefreshTrackedButton lastRun={lastRun} />
        <form action={signOut}>
          <button type="submit" className={rowClass}>
            <RowBody icon={<LogOutIcon className="h-5 w-5" />} title="Sign out" subtitle={email} trailing={<span />} />
          </button>
        </form>
      </AccountGroup>
    </div>
  );
}
