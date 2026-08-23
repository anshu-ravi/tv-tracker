"use client";

import { useRef, useState } from "react";

// Half-step (0.5 ... 5.0) rating input shared by the title detail page and
// the bulk rater. A five-star row can't offer reliable half-star hit
// targets on a phone, so this is a full-width drag bar instead: the whole
// track is the touch surface (not a small thumb you have to grab), the
// value live-updates while dragging, and commits on release/tap -- easy to
// operate one-handed.

const MIN = 0.5;
const MAX = 5.0;
const STEP = 0.5;

function clampToStep(raw: number): number {
  const stepped = Math.round(raw / STEP) * STEP;
  return Math.min(MAX, Math.max(MIN, stepped));
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
    if (!track) return value ?? MIN;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return clampToStep(MIN + ratio * (MAX - MIN));
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
    const base = value ?? MIN - STEP;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(clampToStep(base + STEP));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(clampToStep(base - STEP));
    }
  }

  const percent = displayValue == null ? 0 : ((displayValue - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="stamp text-2xl">
          {displayValue != null ? displayValue.toFixed(1) : "Rate"}
        </span>
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

      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={displayValue ?? MIN}
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
        {displayValue != null && (
          <div
            className="hard-shadow-sm pointer-events-none absolute top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 border-[3px] border-ink bg-paper"
            style={{ left: `${percent}%` }}
          />
        )}
      </div>
    </div>
  );
}
