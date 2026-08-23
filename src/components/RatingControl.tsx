"use client";

import { useRef, useState } from "react";
import { RATING_MAX, RATING_MIN, ratingFromRatio, stepRating } from "@/lib/ratingControl";

// Tenth-step (0.5 ... 5.0) rating input shared by the title detail page and
// the bulk rater. A five-star row can't offer reliable hit targets on a
// phone, so this is a full-width drag bar instead: the whole track is the
// touch surface, the value live-updates while dragging, and commits on
// release/tap. 46 discrete values across the track is too fine to land
// exactly by touch, so the -/+ buttons pair with the drag for precise
// nudging, and tick marks give the empty control a visible scale.
const MAJOR_TICKS = [1, 2, 3, 4, 5];
const MINOR_TICKS = [0.5, 1.5, 2.5, 3.5, 4.5];

function percentFor(v: number): number {
  return ((v - RATING_MIN) / (RATING_MAX - RATING_MIN)) * 100;
}

export default function RatingControl({
  value,
  onChange,
  disabled = false,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const displayValue = dragValue ?? value;

  function valueFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return value ?? RATING_MIN;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return ratingFromRatio(ratio);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setDragValue(valueFromClientX(e.clientX));
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragValue(valueFromClientX(e.clientX));
  }

  function commitDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    const final = valueFromClientX(e.clientX);
    setDragValue(null);
    onChange(final);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(stepRating(value, 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(stepRating(value, -1));
    }
  }

  function handleStep(direction: 1 | -1) {
    if (disabled) return;
    onChange(stepRating(value, direction));
  }

  const percent = displayValue == null ? 0 : percentFor(displayValue);
  const atMin = value != null && value <= RATING_MIN;
  const atMax = value != null && value >= RATING_MAX;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Decrease rating by 0.1"
          onClick={() => handleStep(-1)}
          disabled={disabled || atMin}
          className="hard-shadow-sm flex h-11 w-11 shrink-0 items-center justify-center border-[3px] border-ink bg-paper text-xl font-bold disabled:opacity-40"
        >
          −
        </button>
        <span className="stamp min-w-[4.5ch] text-center text-2xl">
          {displayValue != null ? displayValue.toFixed(1) : "Rate"}
        </span>
        <button
          type="button"
          aria-label="Increase rating by 0.1"
          onClick={() => handleStep(1)}
          disabled={disabled || atMax}
          className="hard-shadow-sm flex h-11 w-11 shrink-0 items-center justify-center border-[3px] border-ink bg-paper text-xl font-bold disabled:opacity-40"
        >
          +
        </button>
        {value != null && (
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="text-[11px] font-bold uppercase tracking-wide text-ink-soft underline decoration-2 underline-offset-2 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>

      <div className="relative pb-4">
        <div
          ref={trackRef}
          role="slider"
          aria-valuemin={RATING_MIN}
          aria-valuemax={RATING_MAX}
          aria-valuenow={displayValue ?? RATING_MIN}
          aria-label="Your rating"
          tabIndex={disabled ? -1 : 0}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={commitDrag}
          onPointerCancel={() => {
            setDragging(false);
            setDragValue(null);
          }}
          onKeyDown={handleKeyDown}
          className={`relative h-14 w-full touch-none border-[3px] border-ink bg-panel ${
            disabled ? "opacity-50" : "cursor-pointer"
          }`}
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 bg-acid" style={{ width: `${percent}%` }} />
          {MINOR_TICKS.map((t) => (
            <div
              key={t}
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-ink/20"
              style={{ left: `${percentFor(t)}%` }}
            />
          ))}
          {MAJOR_TICKS.map((t) => (
            <div
              key={t}
              className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-ink/40"
              style={{ left: `${percentFor(t)}%` }}
            />
          ))}
          {displayValue != null && (
            <div
              className="hard-shadow-sm pointer-events-none absolute top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 border-[3px] border-ink bg-paper"
              style={{ left: `${percent}%` }}
            />
          )}
        </div>
        {MAJOR_TICKS.map((t) => (
          <span
            key={t}
            className="pointer-events-none absolute top-full mt-1 -translate-x-1/2 text-[10px] font-bold text-ink-soft"
            style={{ left: `${percentFor(t)}%` }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
