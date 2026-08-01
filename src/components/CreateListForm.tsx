"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Small inline "create a list" control for the Lists tab. Deliberately no
// modal — a name field + submit button matches how other add flows in the
// app work (e.g. the search add control).
export default function CreateListForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.status === 409) {
        setError("A list with that name already exists.");
        return;
      }
      if (!res.ok) throw new Error("Failed to create list");
      setName("");
      router.refresh();
    } catch {
      setError("Failed to create list.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mb-5">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="hard-shadow-sm flex-1 border-[3px] border-ink bg-paper">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New list name…"
            className="w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-ink-soft"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !name.trim()}
          className="hard-shadow-sm shrink-0 border-[3px] border-ink bg-acid px-4 py-2 text-xs font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {pending ? "Adding…" : "＋ Create"}
        </button>
      </form>
      {error && <p className="mt-1.5 text-[10px] text-ink-soft">{error}</p>}
    </div>
  );
}
