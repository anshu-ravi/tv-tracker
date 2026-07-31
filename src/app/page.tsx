import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export default async function Home() {
  // proxy.ts already gates this route, so a signed-out request never
  // reaches here — but we still need the user's email to greet them.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="card-bold w-full max-w-sm p-8 text-center">
        <h1 className="display text-3xl">TV Tracker</h1>
        <p className="mt-4 text-sm text-ink-soft">Signed in as</p>
        <p className="break-all font-semibold">{user?.email}</p>

        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="hard-shadow-sm w-full border-[3px] border-ink bg-paper px-4 py-3 text-sm font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
