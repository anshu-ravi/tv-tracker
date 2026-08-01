"use client";

import { useRouter } from "next/navigation";

// Detail pages are only reachable by navigating in from a grid/search/home
// screen, so router.back() always lands somewhere sensible — no need to
// track a "from" param.
export default function BackButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="hard-shadow-sm border-[3px] border-ink bg-paper px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
    >
      ← Back
    </button>
  );
}
