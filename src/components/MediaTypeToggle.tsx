"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Label = "tv" | "anime";

const OPTIONS: { value: Label; label: string }[] = [
  { value: "tv", label: "TV" },
  { value: "anime", label: "Anime" },
];

// TV ⇄ Anime switch for a catalog title whose TMDB-based guess was wrong.
export default function MediaTypeToggle({ titleId, initial }: { titleId: string; initial: Label }) {
  const router = useRouter();
  const [value, setValue] = useState<Label>(initial);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function choose(next: Label) {
    if (next === value || saving) return;
    const previous = value;
    setValue(next);
    setSaving(true);
    setFailed(false);
    const res = await fetch(`/api/titles/${titleId}/media-type`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaType: next }),
    });
    setSaving(false);
    if (res.ok) router.refresh();
    else {
      setValue(previous);
      setFailed(true);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        role="group"
        aria-label="Show type"
        className={`inline-flex overflow-hidden border-2 border-ink ${saving ? "opacity-60" : ""}`}
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            disabled={saving}
            onClick={() => choose(o.value)}
            className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide first:border-r-2 first:border-ink ${
              value === o.value ? "bg-acid text-ink" : "bg-paper text-ink-soft"
            }`}
          >
            {o.label}
          </button>
        ))}
      </span>
      {failed && <span className="text-[10px] normal-case text-ink-soft">Couldn&rsquo;t change</span>}
    </span>
  );
}
