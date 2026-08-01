"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Rename / delete controls for a list detail page. Never rendered for the
// implicit Favorites list — the API rejects both operations on it with 400,
// and the page hides this component for it entirely (see lists/[listId]).
export default function ListDetailControls({
  listId,
  name,
}: {
  listId: string;
  name: string;
}) {
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setRenaming(false);
      setValue(name);
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 409) {
        setError("A list with that name already exists.");
        return;
      }
      if (!res.ok) throw new Error("Failed to rename list");
      setRenaming(false);
      router.refresh();
    } catch {
      setError("Failed to rename list.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete the list "${name}"? This can't be undone.`)) return;
    setPending(true);
    try {
      const res = await fetch(`/api/lists/${listId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete list");
      router.push("/lists");
      router.refresh();
    } catch {
      setError("Failed to delete list.");
      setPending(false);
    }
  }

  if (renaming) {
    return (
      <form onSubmit={handleRename} className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <div className="hard-shadow-sm flex-1 border-[3px] border-ink bg-paper">
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-transparent px-3 py-1.5 text-sm outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="hard-shadow-sm shrink-0 border-[3px] border-ink bg-acid px-3 py-1.5 text-xs font-bold uppercase tracking-wide disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setRenaming(false);
              setValue(name);
              setError(null);
            }}
            className="hard-shadow-sm shrink-0 border-[3px] border-ink bg-paper px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
          >
            Cancel
          </button>
        </div>
        {error && <p className="text-[10px] text-ink-soft">{error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setRenaming(true)}
        className="hard-shadow-sm border-[3px] border-ink bg-paper px-3 py-1.5 text-xs font-bold uppercase tracking-wide"
      >
        Rename
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="hard-shadow-sm border-[3px] border-ink bg-paper px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-[#c9482d] disabled:opacity-50"
      >
        Delete
      </button>
      {error && <p className="text-[10px] text-ink-soft">{error}</p>}
    </div>
  );
}
