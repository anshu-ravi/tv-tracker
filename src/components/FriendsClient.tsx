"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProfileAvatar from "@/components/ProfileAvatar";
import {
  formatFriendCode,
  relationTo,
  type FriendsState,
  type Profile,
} from "@/lib/friends";

type Props = { state: FriendsState };

const BTN =
  "hard-shadow-sm shrink-0 border-[3px] border-ink px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50";
const LABEL = "text-[11px] font-bold uppercase tracking-wide text-ink-soft";

async function friendAction(payload: Record<string, unknown>) {
  const res = await fetch("/api/friends", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? "Something went wrong.");
  return body;
}

function PersonRow({ profile, children }: { profile: Profile; children?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2">
      <ProfileAvatar profile={profile} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{profile.display_name || profile.handle}</p>
        <p className="truncate text-[11px] font-bold uppercase tracking-wide text-ink-soft">
          @{profile.handle}
        </p>
      </div>
      {children}
    </li>
  );
}

export default function FriendsClient({ state }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [editingHandle, setEditingHandle] = useState(false);
  const [handle, setHandle] = useState(state.me?.handle ?? "");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/friends?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        const body = await res.json();
        setResults(res.ok ? body.results : []);
      } catch {
        // aborted or offline; keep the previous results
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const visibleResults = query.trim().length >= 2 ? results : [];

  async function run(key: string, payload: Record<string, unknown>, message?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const body = await friendAction(payload);
      if (body?.status === "friends") setNotice("You're now friends.");
      else if (message) setNotice(message);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function saveHandle(e: React.FormEvent) {
    e.preventDefault();
    setBusy("handle");
    setError(null);
    try {
      const res = await fetch("/api/account/handle", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to update handle.");
      setHandle(body.handle);
      setEditingHandle(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update handle.");
    } finally {
      setBusy(null);
    }
  }

  async function shareInvite() {
    if (!state.friendCode) return;
    const inviteUrl = `${window.location.origin}/add/${state.friendCode}`;
    setError(null);
    const shareData = { title: "Add me on TV Tracker", url: inviteUrl };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("Invite link copied.");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Couldn't share the link.");
    }
  }

  function regenerate() {
    if (!confirm("Make a new invite link? The old one stops working.")) return;
    run("regenerate", { action: "regenerate" }, "New invite link ready.");
  }

  function unfriend(profile: Profile) {
    if (!confirm(`Remove ${profile.display_name || profile.handle} from your friends?`)) return;
    run(`unfriend:${profile.id}`, { action: "unfriend", userId: profile.id });
  }

  return (
    <div className="flex flex-col gap-3">
      {(error || notice) && (
        <p
          className={`border-[3px] border-ink p-3 text-sm font-bold ${error ? "bg-[#ff5c39]" : "bg-acid"}`}
        >
          {error ?? notice}
        </p>
      )}

      {state.me && (
        <section className="card-bold p-4">
          <p className={LABEL}>Your handle</p>
          {editingHandle ? (
            <form onSubmit={saveHandle} className="mt-2 flex gap-2">
              <div className="flex flex-1 items-center border-[3px] border-ink bg-paper px-2">
                <span className="text-sm font-bold text-ink-soft">@</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.toLowerCase())}
                  maxLength={24}
                  autoFocus
                  aria-label="Handle"
                  className="w-full bg-transparent px-1 py-2 text-sm font-bold outline-none"
                />
              </div>
              <button type="submit" disabled={busy === "handle"} className={`${BTN} bg-acid`}>
                Save
              </button>
            </form>
          ) : (
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="display truncate text-xl">@{state.me.handle}</p>
              <button type="button" onClick={() => setEditingHandle(true)} className={`${BTN} bg-paper`}>
                Edit
              </button>
            </div>
          )}
        </section>
      )}

      {state.friendCode && (
        <section className="card-bold p-4">
          <p className={LABEL}>Your invite code</p>
          <p className="display mt-1 text-3xl tracking-widest">{formatFriendCode(state.friendCode)}</p>
          <p className="mt-1 text-xs text-ink-soft">
            Anyone who opens your link can add you straight away, so only share it with people you know.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={shareInvite} className={`${BTN} bg-acid`}>
              Share link
            </button>
            <button
              type="button"
              onClick={regenerate}
              disabled={busy === "regenerate"}
              className={`${BTN} bg-paper`}
            >
              New code
            </button>
          </div>
        </section>
      )}

      {state.incoming.length > 0 && (
        <section className="card-bold p-4">
          <p className={LABEL}>Requests · {state.incoming.length}</p>
          <ul className="mt-1 divide-y-2 divide-ink/10">
            {state.incoming.map((r) => (
              <PersonRow key={r.id} profile={r.profile}>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => run(r.id, { action: "accept", requestId: r.id })}
                  className={`${BTN} bg-acid`}
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => run(r.id, { action: "decline", requestId: r.id })}
                  className={`${BTN} bg-paper`}
                  aria-label={`Decline ${r.profile.display_name || r.profile.handle}`}
                >
                  ✕
                </button>
              </PersonRow>
            ))}
          </ul>
        </section>
      )}

      <section className="card-bold p-4">
        <label htmlFor="friend-search" className={LABEL}>
          Find people
        </label>
        <input
          id="friend-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or @handle"
          autoComplete="off"
          className="mt-2 w-full border-[3px] border-ink bg-paper px-3 py-2 text-sm font-bold outline-none placeholder:font-normal placeholder:text-ink-soft"
        />
        {query.trim().length >= 2 && (
          <ul className="mt-2 divide-y-2 divide-ink/10">
            {visibleResults.length === 0 && !searching && (
              <li className="py-2 text-sm text-ink-soft">No one found.</li>
            )}
            {visibleResults.map((p) => {
              const relation = relationTo(state, p.id);
              const incoming = state.incoming.find((r) => r.profile.id === p.id);
              return (
                <PersonRow key={p.id} profile={p}>
                  {relation === "friend" && <span className={LABEL}>Friends</span>}
                  {relation === "outgoing" && <span className={LABEL}>Requested</span>}
                  {relation === "incoming" && incoming && (
                    <button
                      type="button"
                      disabled={busy === incoming.id}
                      onClick={() => run(incoming.id, { action: "accept", requestId: incoming.id })}
                      className={`${BTN} bg-acid`}
                    >
                      Accept
                    </button>
                  )}
                  {relation === "none" && (
                    <button
                      type="button"
                      disabled={busy === `req:${p.id}`}
                      onClick={() =>
                        run(`req:${p.id}`, { action: "request", userId: p.id }, "Request sent.")
                      }
                      className={`${BTN} bg-acid`}
                    >
                      Add
                    </button>
                  )}
                </PersonRow>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card-bold p-4">
        <p className={LABEL}>Friends · {state.friends.length}</p>
        {state.friends.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            No friends yet. Share your invite link or search for someone above.
          </p>
        ) : (
          <ul className="mt-1 divide-y-2 divide-ink/10">
            {state.friends.map((f) => (
              <PersonRow key={f.profile.id} profile={f.profile}>
                <button
                  type="button"
                  disabled={busy === `unfriend:${f.profile.id}`}
                  onClick={() => unfriend(f.profile)}
                  className={`${BTN} bg-paper`}
                >
                  Remove
                </button>
              </PersonRow>
            ))}
          </ul>
        )}
      </section>

      {state.outgoing.length > 0 && (
        <section className="card-bold p-4">
          <p className={LABEL}>Sent requests</p>
          <ul className="mt-1 divide-y-2 divide-ink/10">
            {state.outgoing.map((r) => (
              <PersonRow key={r.id} profile={r.profile}>
                <button
                  type="button"
                  disabled={busy === r.id}
                  onClick={() => run(r.id, { action: "cancel", requestId: r.id })}
                  className={`${BTN} bg-paper`}
                >
                  Cancel
                </button>
              </PersonRow>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
