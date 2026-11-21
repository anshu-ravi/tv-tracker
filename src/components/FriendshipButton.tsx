"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Relation } from "@/lib/friends";

const BTN =
  "hard-shadow-sm border-[3px] border-ink px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50";

// Add / Accept control on the profile of someone you're not friends with yet.
export default function FriendshipButton({
  userId,
  relation,
  requestId,
}: {
  userId: string;
  relation: Exclude<Relation, "self" | "friend">;
  requestId?: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(relation);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(payload: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong.");
      if (body?.status === "requested") setCurrent("outgoing");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {current === "outgoing" && (
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Request sent</p>
      )}
      {current === "incoming" && requestId && (
        <button
          type="button"
          disabled={pending}
          onClick={() => act({ action: "accept", requestId })}
          className={`${BTN} bg-acid`}
        >
          Accept request
        </button>
      )}
      {current === "none" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => act({ action: "request", userId })}
          className={`${BTN} bg-acid`}
        >
          Add friend
        </button>
      )}
      {error && <p className="text-[11px] font-bold uppercase tracking-wide text-red-600">{error}</p>}
    </div>
  );
}
