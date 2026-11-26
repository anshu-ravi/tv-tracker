"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DataSource, MediaType, WatchStatus } from "@/lib/types";
import { useTitleActions } from "@/lib/useTitleActions";
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  DotsIcon,
  HeartIcon,
  ListPlusIcon,
  PlayIcon,
  PlusIcon,
} from "@/components/icons";

const ALL_STATUS_OPTIONS: { value: WatchStatus; label: string }[] = [
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
  isRunning = false,
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
  // Splits "completed" into Caught up (more episodes coming) vs Completed.
  isRunning?: boolean;
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

  // Movies have no "watching" bucket (see CLAUDE.md's movies product
  // decision, enforced server-side in PATCH /api/titles/:id/status and POST
  // /api/titles) — offering it here would just let the user pick an option
  // that fails to save.
  const statusOptions =
    mediaType === "movie"
      ? ALL_STATUS_OPTIONS.filter((o) => o.value !== "watching")
      : ALL_STATUS_OPTIONS;

  const [statusOpen, setStatusOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [typeSaving, setTypeSaving] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);

  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Re-fetches this title from its provider (TMDB) and re-upserts
  // titles + episodes — fixes shows left incomplete by the one-time Trakt
  // import (e.g. a season that was never added because nothing in it had
  // been watched yet). Only meaningful once the title is actually in the
  // catalog, so this is a no-op on the not-yet-added preview page.
  async function onRefresh() {
    if (!resolvedTitleId || refreshing) return;
    setMoreOpen(false);
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

  function closeMenus() {
    setStatusOpen(false);
    setListOpen(false);
    setMoreOpen(false);
  }

  function openMoreMenu() {
    setStatusOpen(false);
    setListOpen(false);
    setMoreOpen((open) => !open);
  }

  async function onSwitchType() {
    if (!resolvedTitleId || typeSaving) return;
    setMoreOpen(false);
    setTypeSaving(true);
    setRefreshError(null);
    try {
      const res = await fetch(`/api/titles/${resolvedTitleId}/media-type`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mediaType: mediaType === "anime" ? "tv" : "anime" }),
      });
      if (!res.ok) throw new Error("Type change failed");
      router.refresh();
    } catch {
      setRefreshError("Couldn't change the type — try again.");
    } finally {
      setTypeSaving(false);
    }
  }

  function openStatusMenu() {
    setListOpen(false);
    setMoreOpen(false);
    setStatusOpen((open) => !open);
  }

  function openListMenu() {
    setStatusOpen(false);
    setMoreOpen(false);
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
    setMoreOpen(false);
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


  const display = statusDisplay(status, isRunning);
  const StatusGlyph = display.Icon;
  const canSwitchType = !!resolvedTitleId && source === "tmdb" && mediaType !== "movie";

  return (
    <div className="flex flex-col gap-1.5">
      {(statusOpen || listOpen || moreOpen) && (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeMenus}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}
      <div className="flex items-stretch gap-2">
        {/* Status */}
        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={openStatusMenu}
            disabled={statusPending}
            aria-haspopup="menu"
            aria-expanded={statusOpen}
            aria-label={status ? `Status: ${display.label}. Change status` : "Add to library"}
            className={`${pressable} h-11 w-full justify-between gap-2 px-3 text-xs font-bold uppercase tracking-wide ${display.className}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <StatusGlyph className="h-4 w-4 shrink-0" />
              <span className="truncate">{display.label}</span>
            </span>
            <ChevronDownIcon className="h-4 w-4 shrink-0" />
          </button>
          {statusOpen && (
            <div role="menu" className={`${menu} left-0 w-full min-w-40`}>
              {statusOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={status === opt.value}
                  onClick={() => onSelectStatus(opt.value)}
                  className={`${menuItem} ${status === opt.value ? "bg-acid" : "bg-paper"}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add to list */}
        <div className="relative">
          <button
            type="button"
            onClick={openListMenu}
            aria-label="Add to list"
            aria-expanded={listOpen}
            className={`${pressable} h-11 w-11 justify-center ${listOpen ? "bg-acid" : "bg-paper"}`}
          >
            <ListPlusIcon className="h-5 w-5" />
          </button>
          {listOpen && (
            <div className={`${menu} right-0 w-56`}>
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
              <form onSubmit={onCreateList} className="flex gap-1 border-t-[3px] border-ink p-2">
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
              {listActionError && <p className="px-3 pb-2 text-[10px] text-ink-soft">{listActionError}</p>}
            </div>
          )}
        </div>

        {/* Favorite */}
        <button
          type="button"
          onClick={toggleFavorite}
          disabled={favPending}
          aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorited}
          className={`${pressable} h-11 w-11 justify-center bg-paper`}
        >
          <HeartIcon filled={favorited} className={`h-5 w-5 ${favorited ? "text-[#c9482d]" : ""}`} />
        </button>

        {/* Rare fix-up actions, only once the title is in the catalog. */}
        {resolvedTitleId && (
          <div className="relative">
            <button
              type="button"
              onClick={openMoreMenu}
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              className={`${pressable} h-11 w-11 justify-center ${moreOpen ? "bg-acid" : "bg-paper"}`}
            >
              <DotsIcon className={`h-5 w-5 ${refreshing || typeSaving ? "animate-pulse" : ""}`} />
            </button>
            {moreOpen && (
              <div role="menu" className={`${menu} right-0 w-52`}>
                <button type="button" role="menuitem" onClick={onRefresh} className={`${menuItem} bg-paper`}>
                  Refresh data
                </button>
                {canSwitchType && (
                  <button type="button" role="menuitem" onClick={onSwitchType} className={`${menuItem} bg-paper`}>
                    Change type to {mediaType === "anime" ? "TV" : "Anime"}
                  </button>
                )}
                {status && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={onRemove}
                    className={`${menuItem} bg-paper text-[#c9482d]`}
                  >
                    Remove from library
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {statusError && <p className="text-[10px] text-ink-soft">That didn&rsquo;t save — try again.</p>}
      {refreshing && <p className="text-[10px] text-ink-soft">Refreshing…</p>}
      {refreshError && <p className="text-[10px] text-ink-soft">{refreshError}</p>}
    </div>
  );
}

const pressable =
  "hard-shadow-sm flex shrink-0 items-center border-[3px] border-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50";
const menu = "card-bold absolute top-full z-30 mt-2 divide-y-[3px] divide-ink overflow-hidden p-0";
const menuItem = "block w-full px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide";

function statusDisplay(
  status: WatchStatus | undefined,
  isRunning: boolean,
): { label: string; Icon: (props: { className?: string }) => React.ReactElement; className: string } {
  switch (status) {
    case "watchlist":
      return { label: "Watchlist", Icon: ClockIcon, className: "bg-acid text-ink" };
    case "watching":
      return { label: "Watching", Icon: PlayIcon, className: "bg-acid text-ink" };
    case "completed":
      return isRunning
        ? { label: "Caught up", Icon: CheckIcon, className: "bg-acid text-ink" }
        : { label: "Completed", Icon: CheckIcon, className: "bg-ink text-paper" };
    case "dnf":
      return { label: "Dropped", Icon: BanIcon, className: "bg-dnf text-ink-soft" };
    default:
      return { label: "Add", Icon: PlusIcon, className: "bg-paper text-ink" };
  }
}
