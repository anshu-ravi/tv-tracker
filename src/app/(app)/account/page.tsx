import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import ProfileEditor from "@/components/ProfileEditor";

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

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Account</h1>

      <div className="card-bold flex items-center gap-3 p-4">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="Profile photo"
            className="h-14 w-14 shrink-0 border-[3px] border-ink object-cover"
          />
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

      {/* TODO: per-user stats (shows tracked, episodes watched) once designed. */}
    </div>
  );
}
