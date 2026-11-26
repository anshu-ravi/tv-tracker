"use client";

import { useCallback, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import ProviderLogo from "@/components/ProviderLogo";
import { ChevronRightIcon } from "@/components/icons";
import type { WatchProvider } from "@/lib/watchSettings";

const SHOWN = 3;

function ProviderList({ heading, providers }: { heading?: string; providers: WatchProvider[] }) {
  if (providers.length === 0) return null;
  return (
    <section>
      {heading && (
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">{heading}</h3>
      )}
      <ul className="flex flex-col gap-2">
        {providers.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <ProviderLogo provider={p} size={36} />
            <span className="text-sm font-bold">{p.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Ratings-strip cell with the first few service logos; tapping it lists every service in a sheet.
export default function ProvidersCell({
  label,
  shown,
  mine,
  others,
}: {
  label: string;
  shown: WatchProvider[];
  mine: WatchProvider[];
  others: WatchProvider[];
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const visible = shown.slice(0, SHOWN);
  const hidden = shown.length - visible.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Where to watch: ${shown.map((p) => p.name).join(", ")}`}
        className="flex min-w-0 flex-1 items-center justify-between gap-1 px-2.5 py-2 text-left active:bg-panel"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">{label}</span>
          <span className="flex min-h-[22px] items-center gap-1">
            {visible.map((p) => (
              <ProviderLogo key={p.id} provider={p} size={22} />
            ))}
            {hidden > 0 && <span className="text-xs font-bold">+{hidden}</span>}
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0" />
      </button>

      <BottomSheet open={open} onClose={close} title="Where to watch">
        <div className="flex flex-col gap-5">
          {mine.length > 0 ? (
            <>
              <ProviderList heading="Your services" providers={mine} />
              <ProviderList heading="Also on" providers={others} />
            </>
          ) : (
            <ProviderList providers={others} />
          )}
        </div>
      </BottomSheet>
    </>
  );
}
