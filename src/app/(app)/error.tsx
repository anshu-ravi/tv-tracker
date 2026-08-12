"use client";

import { useEffect } from "react";

// App-level error boundary — catches any thrown error from a server
// component render under (app) (e.g. a failed Supabase query; see the
// `if (error) throw error` checks added across src/app/(app)/**) that isn't
// caught by a more specific nested boundary first. error.tsx must be a
// Client Component. The shared shell (header + BottomNav,
// src/app/(app)/layout.tsx) stays mounted and painted around this — only
// the content area it wraps is replaced.
export default function AppError({
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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="stamp text-xs">Error</span>
      <h1 className="display text-2xl">Couldn&rsquo;t load this</h1>
      <p className="max-w-xs text-sm text-ink-soft">
        Something went wrong fetching your data. Check your connection and try again.
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
