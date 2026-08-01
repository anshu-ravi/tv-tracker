"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DataSource, ListSummary, MediaType, WatchStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: WatchStatus; label: string }[] = [
  { value: "watchlist", label: "Watchlist" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dnf", label: "DNF" },
];

const JSON_HEADERS = { "content-type": "application/json" } as const;

// --- Icons -------------------------------------------------------------
// Inline SVG only (no icon libraries — a strict CSP blocks external
// anything). Thick strokes, no fill unless "active", so they read as
// neo-brutalist rather than default web-app icons.

function TagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20.5 12.5 12.5 20.5a2 2 0 0 1-2.83 0L3.5 14.33a2 2 0 0 1 0-2.83L11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5z" />
      <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BookmarkPlusIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" />
      <path d="M9.5 8.5h5M12 6v5" />
    </svg>
  );
}

function HeartIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 20.5s-7.5-4.6-10-9.2C.4 8 1.7 4 5.3 3.2c2.4-.5 4.6.6 6.7 3 2.1-2.4 4.3-3.5 6.7-3 3.6.8 4.9 4.8 3.3 8.1-2.5 4.6-10 9.2-10 9.2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 12.5 9.5 18 20 5" />
    </svg>
  );
}

// --- Component -----------------------------------------------------------
// Shared status / add-to-list / favorite controls for both the tracked title
// detail page and the live (not-yet-added) preview page. When `titleId` is
// absent (preview), every mutation resolves the catalog row lazily via the
// provider triple and the component adopts the id the first response hands
// back, so status/list/favorite actions compose in any order.
export default function TitleActionBar({
  source,
  sourceId,
  mediaType,
  titleId,
  initialStatus,
}: {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  titleId?: string;
  initialStatus?: WatchStatus;
}) {
  const router = useRouter();

  const [resolvedTitleId, setResolvedTitleId] = useState<string | undefined>(titleId);
  const [status, setStatus] = useState<WatchStatus | undefined>(initialStatus);
  const [statusPending, setStatusPending] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusError, setStatusError] = useState(false);

  const [listOpen, setListOpen] = useState(false);
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [listsLoading, setListsLoading] = useState(false);
  const [listActionError, setListActionError] = useState<string | null>(null);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  const [favorited, setFavorited] = useState(false);
  const [favPending, setFavPending] = useState(false);

  const triple = { source, sourceId, mediaType };

  async function loadLists(tid: string | undefined) {
    setListsLoading(true);
    try {
      const res = await fetch(`/api/lists${tid ? `?titleId=${tid}` : ""}`);
      if (!res.ok) throw new Error("Failed to load lists");
      const body = (await res.json()) as { lists: ListSummary[] };
      setLists(body.lists);
      setFavorited(body.lists.find((l) => l.isFavorites)?.contains ?? false);
    } catch {
      setListActionError("Failed to load lists.");
    } finally {
      setListsLoading(false);
    }
  }

  // On the detail page (titleId present from the start), the heart needs its
  // real favorited state on mount — otherwise it renders empty until the
  // user happens to open the add-to-list menu, which is what actually
  // fetches it. `lists` doubles as the "have we fetched yet" guard: this
  // fires once resolvedTitleId is known, then again (as a no-op) once lists
  // is no longer null, and never after. Preview pages (no titleId) skip this
  // entirely — an empty heart is correct there since nothing's tracked yet.
  useEffect(() => {
    if (!resolvedTitleId || lists !== null) return;
    // Deferred (not called synchronously in the effect body) so the
    // setState calls inside loadLists happen in a follow-up task rather
    // than cascading straight out of this render.
    // loadLists is intentionally omitted from deps — it's redefined every
    // render, and including it would refire this on every render instead of
    // once (it's not a dependency the effect needs to react to, only a
    // stable-enough-in-practice function it calls).
    const timer = setTimeout(() => void loadLists(resolvedTitleId), 0);
    return () => clearTimeout(timer);
  }, [resolvedTitleId, lists]);

  function openStatusMenu() {
    setListOpen(false);
    setStatusOpen((open) => !open);
  }

  function openListMenu() {
    setStatusOpen(false);
    setListOpen((open) => {
      const next = !open;
      if (next) {
        setListActionError(null);
        void loadLists(resolvedTitleId);
      }
      return next;
    });
  }

  async function handleSelectStatus(next: WatchStatus) {
    setStatusOpen(false);
    setStatusPending(true);
    setStatusError(false);
    try {
      if (resolvedTitleId) {
        const res = await fetch(`/api/titles/${resolvedTitleId}/status`, {
          method: "PATCH",
          headers: JSON_HEADERS,
          body: JSON.stringify({ status: next }),
        });
        if (!res.ok) throw new Error("Failed to update status");
        setStatus(next);
        router.refresh();
      } else {
        const res = await fetch("/api/titles", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ ...triple, status: next }),
        });
        if (!res.ok) throw new Error("Failed to add title");
        const body = (await res.json()) as { titleId: string };
        // Land on the real tracked page rather than lingering on the
        // now-stale live preview.
        router.push(`/title/${body.titleId}`);
      }
    } catch {
      setStatusError(true);
    } finally {
      setStatusPending(false);
    }
  }

  async function handleRemove() {
    if (!resolvedTitleId) return;
    if (!window.confirm("Remove this title from your library?")) return;
    setStatusOpen(false);
    setStatusPending(true);
    setStatusError(false);
    try {
      const res = await fetch(`/api/titles/${resolvedTitleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove title");
      router.push("/");
    } catch {
      setStatusError(true);
      setStatusPending(false);
    }
  }

  async function toggleList(list: ListSummary) {
    const willAdd = !list.contains;
    setLists((prev) =>
      prev?.map((l) =>
        l.id === list.id
          ? { ...l, contains: willAdd, titleCount: l.titleCount + (willAdd ? 1 : -1) }
          : l,
      ) ?? prev,
    );
    setListActionError(null);

    try {
      if (willAdd) {
        const res = await fetch(`/api/lists/${list.id}/titles`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(resolvedTitleId ? { titleId: resolvedTitleId } : triple),
        });
        if (!res.ok) throw new Error("Failed to add to list");
        const body = (await res.json()) as { titleId: string };
        if (!resolvedTitleId) setResolvedTitleId(body.titleId);
        if (list.isFavorites) setFavorited(true);
      } else {
        // A list can only already `contain` a title once it has a resolved
        // catalog id, so this branch always has one.
        if (!resolvedTitleId) return;
        const res = await fetch(`/api/lists/${list.id}/titles/${resolvedTitleId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to remove from list");
        if (list.isFavorites) setFavorited(false);
      }
      router.refresh();
    } catch {
      // Revert the optimistic flip.
      setLists((prev) =>
        prev?.map((l) =>
          l.id === list.id
            ? { ...l, contains: !willAdd, titleCount: l.titleCount + (willAdd ? -1 : 1) }
            : l,
        ) ?? prev,
      );
      setListActionError("That didn't save — try again.");
    }
  }

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;

    setCreatingList(true);
    setListActionError(null);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name }),
      });
      if (res.status === 409) {
        setListActionError("A list with that name already exists.");
        return;
      }
      if (!res.ok) throw new Error("Failed to create list");
      const { list } = (await res.json()) as { list: ListSummary };

      const addRes = await fetch(`/api/lists/${list.id}/titles`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(resolvedTitleId ? { titleId: resolvedTitleId } : triple),
      });
      if (addRes.ok) {
        const addBody = (await addRes.json()) as { titleId: string };
        if (!resolvedTitleId) setResolvedTitleId(addBody.titleId);
      }

      setLists((prev) => [...(prev ?? []), { ...list, contains: true, titleCount: 1 }]);
      setNewListName("");
      router.refresh();
    } catch {
      setListActionError("Failed to create list.");
    } finally {
      setCreatingList(false);
    }
  }

  async function toggleFavorite() {
    const next = !favorited;
    setFavorited(next);
    setFavPending(true);
    try {
      if (next) {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify(resolvedTitleId ? { titleId: resolvedTitleId } : triple),
        });
        if (!res.ok) throw new Error("Failed to favorite");
        const body = (await res.json()) as { titleId: string };
        if (!resolvedTitleId) setResolvedTitleId(body.titleId);
      } else {
        if (!resolvedTitleId) {
          setFavorited(false);
          return;
        }
        const res = await fetch(`/api/favorites?titleId=${resolvedTitleId}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to unfavorite");
      }
      setLists((prev) =>
        prev?.map((l) => (l.isFavorites ? { ...l, contains: next } : l)) ?? prev,
      );
      router.refresh();
    } catch {
      setFavorited(!next);
    } finally {
      setFavPending(false);
    }
  }

  const iconButtonClass = (active: boolean) =>
    `hard-shadow-sm flex h-11 w-11 shrink-0 items-center justify-center border-[3px] border-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 ${
      active ? "bg-acid" : "bg-paper"
    }`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        {/* Status */}
        <div className="relative">
          <button
            type="button"
            onClick={openStatusMenu}
            disabled={statusPending}
            aria-label={status ? `Status: ${status}` : "Add to library"}
            className={iconButtonClass(!!status)}
          >
            <TagIcon className="h-5 w-5" />
          </button>
          {statusOpen && (
            <>
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setStatusOpen(false)}
                className="fixed inset-0 z-20 cursor-default"
              />
              <div className="card-bold absolute left-0 top-full z-30 mt-2 w-40 divide-y-[3px] divide-ink p-0">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectStatus(opt.value)}
                    className={`block w-full px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide ${
                      status === opt.value ? "bg-acid" : "bg-paper"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                {resolvedTitleId && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    className="block w-full bg-paper px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-[#c9482d]"
                  >
                    Remove
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Add to list */}
        <div className="relative">
          <button
            type="button"
            onClick={openListMenu}
            aria-label="Add to list"
            className={iconButtonClass(listOpen)}
          >
            <BookmarkPlusIcon className="h-5 w-5" />
          </button>
          {listOpen && (
            <>
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                onClick={() => setListOpen(false)}
                className="fixed inset-0 z-20 cursor-default"
              />
              <div className="card-bold absolute left-0 top-full z-30 mt-2 w-56 p-0">
                {listsLoading || lists === null ? (
                  <p className="px-3 py-3 text-[11px] text-ink-soft">Loading…</p>
                ) : lists.length === 0 ? (
                  <p className="px-3 py-3 text-[11px] text-ink-soft">No lists yet.</p>
                ) : (
                  <ul className="max-h-56 divide-y-[3px] divide-ink overflow-y-auto">
                    {lists.map((list) => (
                      <li key={list.id}>
                        <button
                          type="button"
                          onClick={() => toggleList(list)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide"
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {list.isFavorites && (
                              <HeartIcon filled className="h-3 w-3 shrink-0 text-[#c9482d]" />
                            )}
                            <span className="truncate">{list.name}</span>
                          </span>
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 border-ink ${
                              list.contains ? "bg-acid" : "bg-paper"
                            }`}
                          >
                            {list.contains && <CheckIcon className="h-2.5 w-2.5" />}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  onSubmit={handleCreateList}
                  className="flex gap-1 border-t-[3px] border-ink p-2"
                >
                  <input
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="New list"
                    className="min-w-0 flex-1 border-[3px] border-ink bg-paper px-2 py-1 text-[11px]"
                  />
                  <button
                    type="submit"
                    disabled={creatingList || !newListName.trim()}
                    aria-label="Create list"
                    className="hard-shadow-sm shrink-0 border-[3px] border-ink bg-acid px-2 py-1 text-xs font-bold disabled:opacity-50"
                  >
                    ＋
                  </button>
                </form>
                {listActionError && (
                  <p className="px-3 pb-2 text-[10px] text-ink-soft">{listActionError}</p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Favorite */}
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={favPending}
          aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
          className={iconButtonClass(favorited)}
        >
          <HeartIcon filled={favorited} className="h-5 w-5" />
        </button>
      </div>

      {statusError && <p className="text-[10px] text-ink-soft">That didn&rsquo;t save — try again.</p>}
    </div>
  );
}
