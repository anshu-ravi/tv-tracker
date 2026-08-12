"use client";

import { useEffect } from "react";

// Library-group error boundary — nearer than the app-level one, so a failed
// query in any of the four library sections (tv/anime/watchlist/lists) is
// caught here first. LibrarySubnav (the segmented TV/Anime/Watchlist/Lists
// control, src/app/(app)/(library)/layout.tsx) stays mounted and painted
// around this, same as the app shell does for AppError.
export default function LibraryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="stamp text-xs">Error</span>
      <h1 className="display text-2xl">Couldn&rsquo;t load this</h1>
      <p className="max-w-xs text-sm text-ink-soft">
        Something went wrong fetching this list. Check your connection and try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="hard-shadow-sm border-[3px] border-ink bg-acid px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        Try again
      </button>
    </div>
  );
}
