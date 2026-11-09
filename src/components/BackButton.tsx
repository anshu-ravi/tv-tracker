"use client";

import { useRouter } from "next/navigation";

// Goes back in history, or to `fallbackHref` when the page was opened directly
// (fresh tab, typed URL) and there is nothing to go back to.
export default function BackButton({ fallbackHref = "/" }: { fallbackHref?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallbackHref))}
      className="hard-shadow-sm border-[3px] border-ink bg-paper px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
    >
      ← Back
    </button>
  );
}
