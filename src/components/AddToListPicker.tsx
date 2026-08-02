"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

// A candidate title from the user's tracked library that isn't already in
// this list — the server page has already excluded anything already a
// member (src/app/(app)/lists/[listId]/page.tsx).
export interface AddToListCandidate {
  id: string;
  title: string;
  posterUrl: string | null;
}

// "＋ Add shows" control for a list detail page: opens a small scrollable
// panel of everything the user is already tracking (across all buckets)
// that isn't in this list yet, with a text filter to narrow by name.
// Picking one POSTs it onto the list, removes it from the candidate list
// client-side, and refreshes the server-rendered grid below.
export default function AddToListPicker({
  listId,
  candidates,
}: {
  listId: string;
  candidates: AddToListCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remaining, setRemaining] = useState(candidates);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return remaining;
    return remaining.filter((c) => c.title.toLowerCase().includes(q));
  }, [remaining, query]);

  async function handleAdd(candidate: AddToListCandidate) {
    setPendingId(candidate.id);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}/titles`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titleId: candidate.id }),
      });
      if (!res.ok) throw new Error("Failed to add to list");
      setRemaining((prev) => prev.filter((c) => c.id !== candidate.id));
      router.refresh();
    } catch {
      setError("That didn't save — try again.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hard-shadow-sm border-[3px] border-ink bg-acid px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      >
        ＋ Add shows
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 cursor-default"
          />
          <div className="card-bold absolute left-0 top-full z-30 mt-2 w-72 p-0">
            <div className="border-b-[3px] border-ink p-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter your shows…"
                className="w-full border-[3px] border-ink bg-paper px-2 py-1.5 text-xs outline-none placeholder:text-ink-soft"
              />
            </div>

            {remaining.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-ink-soft">
                Everything you track is already in this list.
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-4 text-[11px] text-ink-soft">No matches.</p>
            ) : (
              <ul className="max-h-72 divide-y-[3px] divide-ink overflow-y-auto">
                {filtered.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => handleAdd(candidate)}
                      disabled={pendingId === candidate.id}
                      className="flex w-full items-center gap-2 px-2 py-2 text-left disabled:opacity-50"
                    >
                      <div className="relative h-11 w-8 shrink-0 overflow-hidden border-2 border-ink bg-panel">
                        {candidate.posterUrl ? (
                          <Image
                            src={candidate.posterUrl}
                            alt=""
                            fill
                            sizes="32px"
                            className="object-cover"
                          />
                        ) : null}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide">
                        {candidate.title}
                      </span>
                      <span className="shrink-0 text-base font-bold leading-none">
                        {pendingId === candidate.id ? "…" : "＋"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="px-3 pb-2 pt-1 text-[10px] text-ink-soft">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}
