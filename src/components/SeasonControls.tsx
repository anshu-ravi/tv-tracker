"use client";

// "Mark season done" / "Unmark season" for the currently selected season.
// Fully controlled by the parent (EpisodeSection): it owns the pending flag
// and the click handler so the button and the tick list update from the
// same state instead of each holding its own copy.
export default function SeasonControls({
  allWatched,
  pending,
  onToggle,
}: {
  allWatched: boolean;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className="hard-shadow-sm border-[3px] border-ink bg-paper px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-transform active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-50"
    >
      {pending
        ? "Working…"
        : allWatched
          ? "Unmark season"
          : "Mark season done"}
    </button>
  );
}
