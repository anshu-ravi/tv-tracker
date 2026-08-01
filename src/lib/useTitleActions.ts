"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DataSource, ListSummary, MediaType, WatchStatus } from "@/lib/types";

const JSON_HEADERS = { "content-type": "application/json" } as const;

// Shared status / add-to-list / favorite mutation logic for both the tracked
// title detail page and the live (not-yet-added) preview page, plus the
// poster-grid bottom action sheet. When `titleId` is absent (preview), every
// mutation resolves the catalog row lazily via the provider triple and the
// hook adopts the id the first response hands back, so status/list/favorite
// actions compose in any order.
export function useTitleActions({
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
  const router = useRouter();

  const [resolvedTitleId, setResolvedTitleId] = useState<string | undefined>(titleId);
  const [status, setStatus] = useState<WatchStatus | undefined>(initialStatus);
  const [statusPending, setStatusPending] = useState(false);
  const [statusError, setStatusError] = useState(false);

  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [listsLoading, setListsLoading] = useState(false);
  const [listActionError, setListActionError] = useState<string | null>(null);

  const [favorited, setFavorited] = useState(initialFavorited ?? false);
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
  // Callers that already know favorite status (grid cards, via
  // `initialFavorited`) skip this fetch altogether — with many cards per
  // page it would otherwise fire once per card just to learn a boolean the
  // server already had in hand.
  useEffect(() => {
    if (initialFavorited !== undefined) return;
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
  }, [resolvedTitleId, lists, initialFavorited]);

  async function handleSelectStatus(next: WatchStatus) {
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

  async function handleCreateList(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;

    setListActionError(null);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name: trimmed }),
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
      router.refresh();
    } catch {
      setListActionError("Failed to create list.");
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

  return {
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
  };
}
