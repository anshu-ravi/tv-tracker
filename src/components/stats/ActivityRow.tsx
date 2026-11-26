"use client";

import { useCallback, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import { RowBody, rowClass } from "@/components/account/AccountList";
import { ClockIcon } from "@/components/icons";

// Row that opens the per-year activity chart in a bottom sheet.
export default function ActivityRow({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={rowClass}>
        <RowBody icon={<ClockIcon className="h-5 w-5" />} title="Activity by year" subtitle={subtitle} />
      </button>
      <BottomSheet open={open} onClose={close} title="Activity by year">
        {children}
      </BottomSheet>
    </>
  );
}
