import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import BottomNav from "@/components/BottomNav";

// Shared shell for every authed screen: a slim header (brand + sign out) and
// a fixed bottom-tab nav. /login and /auth stay outside this route group, so
// they render without either.
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col border-x-[3px] border-ink">
      <header className="flex items-center justify-between border-b-[3px] border-ink bg-paper px-4 py-3">
        <span className="display text-lg">TV Tracker</span>
        <div className="flex items-center gap-3">
          <span className="hidden max-w-[10rem] truncate text-xs text-ink-soft sm:inline">
            {user?.email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="hard-shadow-sm border-[3px] border-ink bg-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Bottom padding clears the floating BottomNav (its own height, the
          gap it floats above the edge by, and the iOS safe-area inset) so
          page content never sits behind it. */}
      <main
        className="flex-1"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6rem)" }}
      >
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
