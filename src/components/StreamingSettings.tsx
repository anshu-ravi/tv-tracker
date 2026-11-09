"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProviderLogo from "@/components/ProviderLogo";
import type { WatchProvider } from "@/lib/watchSettings";

// Country picker + toggleable grid of that country's streaming services.
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
  const router = useRouter();
  const [region, setRegion] = useState(initialRegion ?? "");
  const [providers, setProviders] = useState(initialProviders);
  const [selected, setSelected] = useState(() => new Set(initialSelected));
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loadError, setLoadError] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  function changeRegion(next: string) {
    setRegion(next);
    setSaveState("idle");
    inflight.current?.abort();
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

  function toggle(id: number) {
    setSaveState("idle");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setSaveState("saving");
    // Ids are global across countries, so services picked elsewhere are kept.
    const res = await fetch("/api/account/watch-settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ region, providerIds: [...selected] }),
    });
    setSaveState(res.ok ? "saved" : "error");
    if (res.ok) router.refresh();
  }

  const q = query.trim().toLowerCase();
  const visible = q ? providers.filter((p) => p.name.toLowerCase().includes(q)) : providers;
  const mine = providers.filter((p) => selected.has(p.id));

  return (
    <div className="space-y-4">
      <div className="card-bold p-4">
        <label htmlFor="watch-region" className="text-xs font-bold uppercase tracking-wide text-ink-soft">
          Country
        </label>
        <select
          id="watch-region"
          value={region}
          onChange={(e) => changeRegion(e.target.value)}
          className="mt-2 w-full border-[3px] border-ink bg-paper px-2 py-2 text-sm font-bold"
        >
          {!region && <option value="">Choose a country</option>}
          {regions.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-[11px] text-ink-soft">
          Where-to-watch data comes from this country&rsquo;s catalogue, so set it to match your VPN.
        </p>
      </div>

      {region && (
        <div className="card-bold p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Your services</h2>
            <span className="stamp text-[10px]">{mine.length} picked</span>
          </div>

          {mine.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {mine.map((p) => (
                <ProviderLogo key={p.id} provider={p} size={36} />
              ))}
            </div>
          )}

          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services"
            className="mt-3 w-full border-[3px] border-ink bg-paper px-2 py-2 text-sm"
          />

          {loading ? (
            <p className="mt-3 text-sm text-ink-soft">Loading services…</p>
          ) : loadError ? (
            <p className="mt-3 text-sm text-ink-soft">Couldn&rsquo;t load services for this country.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-4 gap-2">
              {visible.map((p) => {
                const on = selected.has(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(p.id)}
                      className={`flex w-full flex-col items-center gap-1 rounded-[10px] border-2 p-1.5 transition-colors ${
                        on ? "border-ink bg-acid" : "border-transparent"
                      }`}
                    >
                      <ProviderLogo provider={p} size={48} />
                      <span className="line-clamp-2 text-center text-[9px] font-bold uppercase leading-tight">
                        {p.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="sticky bottom-3 z-20">
        <button
          type="button"
          onClick={save}
          disabled={!region || saveState === "saving"}
          className="hard-shadow w-full border-[3px] border-ink bg-acid py-3 text-sm font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-50"
        >
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved ✓" : saveState === "error" ? "Couldn't save — retry" : "Save"}
        </button>
      </div>
    </div>
  );
}
