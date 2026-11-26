"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import BottomSheet from "@/components/BottomSheet";
import { CameraIcon } from "@/components/icons";

function Avatar({ src, initial, size }: { src: string | null; initial: string; size: number }) {
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden border-[3px] border-ink ${
        src ? "bg-panel" : "bg-acid"
      }`}
      style={{ width: size, height: size }}
    >
      {src ? (
        // A blob: preview URL can't go through next/image's optimizer.
        <Image src={src} alt="Profile photo" fill sizes={`${size}px`} className="object-cover" unoptimized={src.startsWith("blob:")} />
      ) : (
        <span className="display" style={{ fontSize: size * 0.4 }}>
          {initial}
        </span>
      )}
    </div>
  );
}

const label = "text-[11px] font-bold uppercase tracking-wide text-ink-soft";
const field =
  "border-[3px] border-ink bg-paper px-3 py-2 text-sm font-bold text-ink outline-none placeholder:font-normal placeholder:text-ink-soft";

// Avatar, name and handle, with an Edit button that opens the profile sheet.
export default function ProfileHeader({
  displayName,
  handle,
  avatarUrl,
  email,
}: {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  email: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(displayName);
  const [handleInput, setHandleInput] = useState(handle ?? "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const initial = (displayName || email || "?").charAt(0).toUpperCase();

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  function openSheet() {
    setName(displayName);
    setHandleInput(handle ?? "");
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
    setOpen(true);
  }

  function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const file = fileRef.current?.files?.[0];
      const trimmedName = name.trim();
      if (file || trimmedName !== displayName) {
        const form = new FormData();
        form.append("display_name", trimmedName);
        if (file) form.append("avatar", file);
        const res = await fetch("/api/account/profile", { method: "POST", body: form });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Couldn't save your profile.");
      }
      const trimmedHandle = handleInput.trim();
      if (trimmedHandle && trimmedHandle !== handle) {
        const res = await fetch("/api/account/handle", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle: trimmedHandle }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Couldn't save your handle.");
      }
      router.refresh();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar src={avatarUrl} initial={initial} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="display truncate text-2xl leading-tight">{displayName || "No name yet"}</h1>
          {handle && <p className="truncate text-xs font-bold text-ink-soft">@{handle}</p>}
        </div>
        <button
          type="button"
          onClick={openSheet}
          className="hard-shadow-sm shrink-0 border-[3px] border-ink bg-paper px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          Edit
        </button>
      </div>

      <BottomSheet open={open} onClose={close} title="Edit profile">
        <form onSubmit={onSave} className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile photo"
            className="relative mx-auto mt-1"
          >
            <Avatar src={previewUrl ?? avatarUrl} initial={initial} size={88} />
            <span className="hard-shadow-sm absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center border-[3px] border-ink bg-paper">
              <CameraIcon className="h-4 w-4" />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />

          <label className="flex flex-col gap-1.5">
            <span className={label}>Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={field} />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={label}>Handle</span>
            <span className="flex items-center border-[3px] border-ink bg-paper pl-3">
              <span className="text-sm font-bold text-ink-soft">@</span>
              <input
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm font-bold outline-none"
              />
            </span>
          </label>

          {error && <p className="text-[11px] font-bold text-[#c9482d]">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="hard-shadow-sm flex h-11 items-center justify-center border-[3px] border-ink bg-acid text-xs font-bold uppercase tracking-wide transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      </BottomSheet>
    </>
  );
}
