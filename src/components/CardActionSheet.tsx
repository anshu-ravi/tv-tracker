"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { DataSource, MediaType, WatchStatus } from "@/lib/types";
import { useTitleActions } from "@/lib/useTitleActions";
import { TagIcon, HeartIcon, CheckIcon } from "@/components/icons";

const STATUS_OPTIONS: { value: WatchStatus; label: string }[] = [
  { value: "watchlist", label: "Watchlist" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dnf", label: "DNF" },
];

// The single "⋯" trigger + bottom action sheet used on poster-grid cards
// (TV/Anime/Watchlist). Replaces the old always-on 3-icon compact row —
// browsing grids stay clean and the status/list/favorite actions live one
// tap away, expanded (no nested popovers; the sheet itself is the menu).
// Shares its mutation logic with the detail/preview TitleActionBar via
// useTitleActions.
export default function CardActionSheet({
  title,
  source,
  sourceId,
  mediaType,
  titleId,
  initialStatus,
  initialFavorited,
}: {
  title: string;
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  titleId?: string;
  initialStatus?: WatchStatus;
  initialFavorited?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Once true, the sheet stays mounted in the DOM (hidden via CSS transform)
  // instead of being torn down on close — see the plain-CSS-transition note
  // below for why.
  const [hasOpened, setHasOpened] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  // The trigger button lives inside the poster's <Link> (for placement over
  // the card), but the sheet itself is portaled straight to <body>. Without
  // that, every click inside the sheet (status/list/favorite buttons) would
  // bubble up through the DOM to the <Link> and navigate to the detail page
  // instead of performing the action.
  //
  // The slide is a plain CSS transform transition, not Framer Motion's `y:
  // "100%"` animation — Framer measures the element's own height to convert
  // that percentage to pixels, but the "Add to list" section grows once
  // `loadLists` resolves mid-animation, so the transform landed on a stale
  // residual offset instead of settling at 0. That silently desynced the
  // sheet's clickable position from where it was drawn, so taps near the
  // bottom missed the sheet and hit the grid card underneath. Toggling a
  // fixed `translate-y-full`/`translate-y-0` class sidesteps that entirely.

  const {
    resolvedTitleId,
    status,
    statusPending,
    statusError,
    lists,
    listsLoading,
    listActionError,
    favorited,
    favPending,
    loadLists,
    handleSelectStatus,
    handleRemove,
    toggleList,
    handleCreateList,
    toggleFavorite,
  } = useTitleActions({ source, sourceId, mediaType, titleId, initialStatus, initialFavorited });

  function openSheet(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setHasOpened(true);
    setOpen(true);
    void loadLists(resolvedTitleId);
  }

  function closeSheet() {
    setOpen(false);
  }

  async function onCreateList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;
    setCreatingList(true);
    try {
      await handleCreateList(newListName);
      setNewListName("");
    } finally {
      setCreatingList(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-label={`Actions for ${title}`}
        className="hard-shadow-sm absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center border-[3px] border-ink bg-paper text-sm font-bold leading-none"
      >
        ⋯
      </button>

      {hasOpened &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              aria-hidden="true"
              onClick={closeSheet}
              className={`fixed inset-0 z-40 cursor-default bg-ink/40 transition-opacity duration-200 ${
                open ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            />
            <div
              role="dialog"
              aria-label={`Actions for ${title}`}
              aria-hidden={!open}
              className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t-[3px] border-ink bg-paper transition-transform duration-200 ease-out ${
                open ? "translate-y-0" : "pointer-events-none translate-y-full"
              }`}
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
            >
              <div className="flex items-center justify-between border-b-[3px] border-ink px-4 py-3">
                <h2 className="display truncate pr-2 text-lg">{title}</h2>
                <button
                  type="button"
                  onClick={closeSheet}
                  aria-label="Close"
                  className="hard-shadow-sm flex h-8 w-8 shrink-0 items-center justify-center border-[3px] border-ink bg-paper text-base font-bold leading-none"
                >
                  ×
                </button>
              </div>

              <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto px-4 py-4">
                {/* Status */}
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                    <TagIcon className="h-3.5 w-3.5" /> Status
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {STATUS_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={statusPending}
                        onClick={() => void handleSelectStatus(opt.value)}
                        className={`hard-shadow-sm border-[3px] border-ink px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 ${
                          status === opt.value ? "bg-acid" : "bg-paper"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {resolvedTitleId && (
                    <button
                      type="button"
                      disabled={statusPending}
                      onClick={() => void handleRemove()}
                      className="mt-2 w-full border-[3px] border-ink bg-paper px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-[#c9482d] disabled:opacity-50"
                    >
                      Remove from library
                    </button>
                  )}
                  {statusError && (
                    <p className="mt-1 text-[10px] text-ink-soft">That didn&rsquo;t save — try again.</p>
                  )}
                </section>

                {/* Add to list */}
                <section>
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                    Add to list
                  </h3>
                  {listsLoading || lists === null ? (
                    <p className="text-[11px] text-ink-soft">Loading…</p>
                  ) : lists.length === 0 ? (
                    <p className="text-[11px] text-ink-soft">No lists yet.</p>
                  ) : (
                    <ul className="card-bold divide-y-[3px] divide-ink p-0">
                      {lists.map((list) => (
                        <li key={list.id}>
                          <button
                            type="button"
                            onClick={() => void toggleList(list)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide"
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
                  <form onSubmit={onCreateList} className="mt-2 flex gap-1">
                    <input
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="New list"
                      className="min-w-0 flex-1 border-[3px] border-ink bg-paper px-2 py-1.5 text-[11px]"
                    />
                    <button
                      type="submit"
                      disabled={creatingList || !newListName.trim()}
                      aria-label="Create list"
                      className="hard-shadow-sm shrink-0 border-[3px] border-ink bg-acid px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                    >
                      ＋
                    </button>
                  </form>
                  {listActionError && (
                    <p className="mt-1 text-[10px] text-ink-soft">{listActionError}</p>
                  )}
                </section>

                {/* Favorite */}
                <section>
                  <button
                    type="button"
                    onClick={() => void toggleFavorite()}
                    disabled={favPending}
                    className={`hard-shadow-sm flex w-full items-center justify-center gap-2 border-[3px] border-ink px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50 ${
                      favorited ? "bg-acid" : "bg-paper"
                    }`}
                  >
                    <HeartIcon filled={favorited} className="h-4 w-4" />
                    {favorited ? "Favorited" : "Add to favorites"}
                  </button>
                </section>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
