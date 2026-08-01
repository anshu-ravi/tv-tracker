import BottomNav from "@/components/BottomNav";

// Shared shell for every authed screen: a slim header (brand only — identity
// and sign out now live on /account) and a fixed bottom-tab nav. /login and
// /auth stay outside this route group, so they render without either.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col border-x-[3px] border-ink">
      <header className="flex items-center border-b-[3px] border-ink bg-paper px-4 py-3">
        <span className="display text-lg">TV Tracker</span>
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
