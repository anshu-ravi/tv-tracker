"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddFriendButton({ code }: { code: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "redeem", code }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Couldn't add friend.");
      router.push("/account/friends");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add friend.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={add}
        disabled={pending}
        className="hard-shadow-sm border-[3px] border-ink bg-acid px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add friend"}
      </button>
      {error && <p className="text-[11px] font-bold uppercase tracking-wide text-red-600">{error}</p>}
    </div>
  );
}
