"use client";

import { useRef, useState } from "react";
import ProviderLogo from "@/components/ProviderLogo";
import { CheckIcon } from "@/components/icons";
import type { WatchProvider } from "@/lib/watchSettings";

const TOP_COUNT = 12;

const isChannel = (p: WatchProvider) => /channel$/i.test(p.name.trim());

type SaveState = "idle" | "saving" | "saved" | "error";

const group = "divide-y-2 divide-ink border-2 border-ink bg-paper";
const row = "flex w-full items-center gap-3 px-3 py-2.5 text-left";
const heading = "text-[11px] font-bold uppercase tracking-wide text-ink-soft";

// Country picker plus the user's streaming services; every change saves immediately.
export default function StreamingSettings({
  regions,
  initialRegion,
  initialProviders,
  initialSelected,
}: {
  regions: { code: string; name: string }[];
  initialRegion: string | null;
  initialProviders: WatchProvider[];
  initialSelected: number[];
}) {
  const [region, setRegion] = useState(initialRegion ?? "");
  const [providers, setProviders] = useState(initialProviders);
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const inflight = useRef<AbortController | null>(null);
  const saved = useRef({ region: initialRegion ?? "", ids: new Set(initialSelected) });
  const queue = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(0);

  // Saves run one at a time and only the newest pending state is sent, so rapid taps can't land out of order.
  function persist(nextRegion: string, nextIds: Set<number>) {
    const id = ++latest.current;
    setSaveState("saving");
    queue.current = queue.current.then(async () => {
      if (id !== latest.current) return;
      let ok = false;
      try {
        const res = await fetch("/api/account/watch-settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          // Ids are global across countries, so services picked elsewhere are kept.
          body: JSON.stringify({ region: nextRegion, providerIds: [...nextIds] }),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }
      if (id !== latest.current) return;
      if (ok) {
        saved.current = { region: nextRegion, ids: new Set(nextIds) };
        setSaveState("saved");
      } else {
        setSelected(new Set(saved.current.ids));
        if (saved.current.region !== nextRegion) loadRegion(saved.current.region);
        setRegion(saved.current.region);
        setSaveState("error");
      }
    });
  }

  function loadRegion(next: string) {
    inflight.current?.abort();
    if (!next) return;
    const controller = new AbortController();
    inflight.current = controller;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/watch-providers?region=${next}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: { providers: WatchProvider[] }) => setProviders(json.providers))
      .catch((err) => {
        if (err.name !== "AbortError") setLoadError(true);
      })
      .finally(() => {
        if (inflight.current === controller) setLoading(false);
      });
  }

  function changeRegion(next: string) {
    setRegion(next);
    setShowAll(false);
    loadRegion(next);
    persist(next, selected);
  }

  function toggle(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    persist(region, next);
  }

  const mine = providers.filter((p) => selected.has(p.id));
  const elsewhere = selected.size - mine.length;
  const q = query.trim().toLowerCase();
  const candidates = providers.filter((p) => !selected.has(p.id));
  const matches = q
    ? candidates.filter((p) => p.name.toLowerCase().includes(q))
    : candidates.filter((p) => !isChannel(p));
  const visible = q || showAll ? matches : matches.slice(0, TOP_COUNT);
  const hiddenCount = matches.length - visible.length;

  return (
    <div className="space-y-6">
      <section>
        <label className={`${row} cursor-pointer border-2 border-ink bg-paper`}>
          <span className="flex-1 text-sm font-bold">Country</span>
          <select
            value={region}
            onChange={(e) => changeRegion(e.target.value)}
            aria-label="Country"
            className="max-w-[60%] bg-transparent text-right text-sm font-bold outline-none"
          >
            {!region && <option value="">Choose</option>}
            {regions.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-1.5 text-[11px] text-ink-soft">Where-to-watch uses this country&rsquo;s catalogue — match it to your VPN.</p>
      </section>

      {region && (
        <>
          <section>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className={heading}>Your services · {mine.length}</h2>
              <SaveBadge state={saveState} />
            </div>
            {loading ? (
              <p className="text-sm text-ink-soft">Loading services…</p>
            ) : mine.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {mine.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      aria-label={`Remove ${p.name}`}
                      className="flex max-w-full items-center gap-2 border-2 border-ink bg-paper py-1 pl-1 pr-2 active:bg-panel"
                    >
                      <ProviderLogo provider={p} size={24} />
                      <span className="truncate text-xs font-bold">{p.name}</span>
                      <span aria-hidden="true" className="text-sm font-bold leading-none text-ink-soft">
                        ×
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-2 border-dashed border-ink/40 px-3 py-3 text-[11px] text-ink-soft">
                None yet — add the services you pay for below.
              </p>
            )}
            {elsewhere > 0 && (
              <p className="mt-1.5 text-[11px] text-ink-soft">
                +{elsewhere} picked in other countries
              </p>
            )}
          </section>

          <section>
            <h2 className={`${heading} mb-2`}>Add services</h2>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${providers.length} services`}
              className="mb-2 w-full border-[3px] border-ink bg-paper px-3 py-2 text-sm outline-none placeholder:text-ink-soft"
            />
            {loading ? null : loadError ? (
              <p className="text-sm text-ink-soft">Couldn&rsquo;t load services for this country.</p>
            ) : visible.length === 0 ? (
              <p className="text-[11px] text-ink-soft">{q ? "No matches." : "Nothing left to add."}</p>
            ) : (
              <ul className={group}>
                {visible.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => toggle(p.id)} aria-label={`Add ${p.name}`} className={`${row} active:bg-panel`}>
                      <ProviderLogo provider={p} size={28} />
                      <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.name}</span>
                      <span className="h-5 w-5 shrink-0 border-2 border-ink bg-paper" aria-hidden="true" />
                    </button>
                  </li>
                ))}
                {hiddenCount > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setShowAll(true)}
                      className={`${row} justify-center text-[11px] font-bold uppercase tracking-wide`}
                    >
                      Show all {matches.length}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "error") return <span className="text-[11px] font-bold text-[#c9482d]">Couldn&rsquo;t save</span>;
  return (
    <span className="flex items-center gap-1 text-[11px] font-bold text-ink-soft" aria-live="polite">
      {state === "saving" ? "Saving…" : (
        <>
          <CheckIcon className="h-3 w-3" /> Saved
        </>
      )}
    </span>
  );
}
