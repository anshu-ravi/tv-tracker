import LibrarySubnav from "@/components/LibrarySubnav";

// Route group (no URL segment) shared by the four library sections — TV,
// Anime, Watchlist, Lists (and its [listId] detail page). Renders the
// segmented sub-nav once here instead of duplicating it in every page.
export default function LibraryLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <LibrarySubnav />
      {children}
    </div>
  );
}
