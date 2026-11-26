"use client";

import { useCallback, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { ChevronRightIcon } from "@/components/icons";

// One-line friends summary that opens the full friend list in a sheet.
export default function FriendsSheetButton({
  avatars,
  text,
  children,
}: {
  avatars: React.ReactNode;
  text: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-4 mt-4 flex w-[calc(100%-2rem)] items-center gap-3 py-1 text-left"
      >
        <span className="flex shrink-0">{avatars}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wide">
          {text}
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0" />
      </button>
      <BottomSheet open={open} onClose={close} title="Friends">
        {children}
      </BottomSheet>
    </>
  );
}
