"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Slide-up sheet with a dimmed backdrop; closes on backdrop tap, the × button or Escape.
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // Mount on first open only, then keep mounted so the close slide can play.
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) setHasOpened(true);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!hasOpened || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`fixed inset-0 z-40 cursor-default bg-ink/40 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md border-t-[3px] border-ink bg-paper transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "pointer-events-none translate-y-full"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
      >
        <div className="flex items-center justify-between border-b-[3px] border-ink px-4 py-3">
          <h2 className="display truncate pr-2 text-lg">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="hard-shadow-sm flex h-8 w-8 shrink-0 items-center justify-center border-[3px] border-ink bg-paper text-base font-bold leading-none"
          >
            ×
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </>,
    document.body,
  );
}
