import BottomNav from "@/components/BottomNav";
import ScrollableMain from "@/components/ScrollableMain";

// Shared shell for every authed screen: a slim static header (brand only —
// identity and sign out now live on /account), a scrolling main, and a
// docked bottom-tab nav. /login and /auth stay outside this route group, so
// they render without either.
//
// Fixed-height flex column (`h-dvh` + `overflow-hidden`) with `<main>` as the
// only scrolling element. This is a deliberate app-shell layout, not
// incidental: iOS lays `position: fixed` elements out against the *layout*
// viewport rather than the visual one, so a floating fixed bottom nav can
// visually detach and strand mid-screen when the software keyboard opens or
// during momentum scrolling. Nothing in this tree is `fixed` anymore, so
// there is nothing for iOS to strand.
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden border-x-[3px] border-ink">
      <header className="flex items-center border-b-[3px] border-ink bg-paper px-4 py-3">
        <span className="display text-lg">TV Tracker</span>
      </header>

      <ScrollableMain>{children}</ScrollableMain>

      <BottomNav />
    </div>
  );
}
