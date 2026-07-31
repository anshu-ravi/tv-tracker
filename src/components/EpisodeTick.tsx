"use client";

// One episode row's tick control. Fully controlled by the parent
// (EpisodeSection) — no local watched state — so it can never drift from a
// bulk "mark season done" action elsewhere on the page.
export default function EpisodeTick({
  watched,
  pending,
  onToggle,
}: {
  watched: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      aria-pressed={watched}
      aria-label={watched ? "Mark episode unwatched" : "Mark episode watched"}
      className={`hard-shadow-sm flex h-6 w-6 shrink-0 items-center justify-center border-[3px] border-ink text-xs font-bold transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50 ${
        watched ? "bg-acid text-ink" : "bg-paper text-ink-soft"
      }`}
    >
      {watched ? "✓" : ""}
    </button>
  );
}
