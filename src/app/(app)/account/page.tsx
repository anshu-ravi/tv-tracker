import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

// Minimal account screen — currently just identity + sign out, both moved
// here from the app-shell header. Future home for display name, avatar, and
// per-user stats (shows tracked, episodes watched, etc.).
export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="px-4 py-6">
      <h1 className="display mb-4 text-3xl">Account</h1>

      <div className="card-bold flex items-center justify-between gap-3 p-4">
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

      {/* TODO: display name, avatar, and stats (shows tracked, episodes
          watched) once those are designed. */}
    </div>
  );
}
