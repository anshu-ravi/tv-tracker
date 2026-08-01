"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DataSource, MediaType, WatchStatus } from "@/lib/types";
import { useTitleActions } from "@/lib/useTitleActions";
import { TagIcon, BookmarkPlusIcon, HeartIcon, CheckIcon, RefreshIcon } from "@/components/icons";

const STATUS_OPTIONS: { value: WatchStatus; label: string }[] = [
  { value: "watchlist", label: "Watchlist" },
  { value: "watching", label: "Watching" },
  { value: "completed", label: "Completed" },
  { value: "dnf", label: "DNF" },
];

// --- Component -----------------------------------------------------------
// Shared status / add-to-list / favorite controls for both the tracked title
// detail page and the live (not-yet-added) preview page. When `titleId` is
// absent (preview), every mutation resolves the catalog row lazily via the
// provider triple and the component adopts the id the first response hands
// back, so status/list/favorite actions compose in any order.
//
// Poster-grid cards no longer use this component — they get a compact "⋯"
// trigger + bottom action sheet instead (see CardActionSheet), which shares
// the same underlying useTitleActions hook.
export default function TitleActionBar({
  source,
  sourceId,
  mediaType,
  titleId,
  initialStatus,
  initialFavorited,
}: {
  source: DataSource;
  sourceId: string;
  mediaType: MediaType;
  titleId?: string;
  initialStatus?: WatchStatus;
  // Seeds the heart's initial state so grid cards (many per page) don't each
  // fire the `/api/lists?titleId=` on-mount fetch just to learn favorite
  // status — the caller already knows it from one batched query. Leave
  // undefined (detail/preview pages) to keep the original fallback fetch.
  initialFavorited?: boolean;
}) {
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

  const [statusOpen, setStatusOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Re-fetches this title from its provider (TMDB/AniList) and re-upserts
  // titles + episodes — fixes shows left incomplete by the one-time Trakt
  // import (e.g. a season that was never added because nothing in it had
  // been watched yet). Only meaningful once the title is actually in the
  // catalog, so this is a no-op on the not-yet-added preview page.
  async function onRefresh() {
    if (!resolvedTitleId || refreshing) return;
    setRefreshing(true);
    setRefreshError(null);
    try {
      const res = await fetch("/api/titles/refresh", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titleId: resolvedTitleId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Refresh failed");
      }
      router.refresh();
    } catch {
      setRefreshError("Couldn't refresh — try again.");
    } finally {
      setRefreshing(false);
    }
  }

  function openStatusMenu() {
    setListOpen(false);
    setStatusOpen((open) => !open);
  }

  function openListMenu() {
    setStatusOpen(false);
    setListOpen((open) => {
      const next = !open;
      if (next) void loadLists(resolvedTitleId);
      return next;
    });
  }

  async function onSelectStatus(next: WatchStatus) {
    setStatusOpen(false);
    await handleSelectStatus(next);
  }

  async function onRemove() {
    setStatusOpen(false);
    await handleRemove();
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
                    onClick={() => onSelectStatus(opt.value)}
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
                    onClick={onRemove}
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
                  onSubmit={onCreateList}
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

        {/* Refresh data — only meaningful once the title is actually in the
            catalog (resolvedTitleId set), so hidden on the preview page. */}
        {resolvedTitleId && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Refresh data"
            className={iconButtonClass(false)}
          >
            <RefreshIcon className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {statusError && <p className="text-[10px] text-ink-soft">That didn&rsquo;t save — try again.</p>}
      {refreshError && <p className="text-[10px] text-ink-soft">{refreshError}</p>}
    </div>
  );
}
