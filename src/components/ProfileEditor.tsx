"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  initialDisplayName: string;
  initialAvatarUrl: string | null;
};

type Status = { kind: "idle" } | { kind: "pending" } | { kind: "success"; message: string } | { kind: "error"; message: string };

export default function ProfileEditor({ initialDisplayName, initialAvatarUrl }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "pending" });

    const trimmedName = displayName.trim();
    const file = fileInputRef.current?.files?.[0];

    try {
      const formData = new FormData();
      formData.append("display_name", trimmedName);
      if (file) {
        formData.append("avatar", file);
      }

      const response = await fetch("/api/account/profile", {
        method: "POST",
        body: formData,
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.error ?? "Something went wrong.");
      }

      setStatus({ kind: "success", message: "Profile updated." });
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      setStatus({ kind: "error", message });
    }
  }

  const isPending = status.kind === "pending";

  return (
    <form onSubmit={handleSubmit} className="card-bold mt-3 flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="display-name"
          className="text-[11px] font-bold uppercase tracking-wide text-ink-soft"
        >
          Display name
        </label>
        <input
          id="display-name"
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Your name"
          className="border-[3px] border-ink bg-paper px-3 py-2 text-sm font-bold text-ink outline-none placeholder:font-normal placeholder:text-ink-soft"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="avatar-upload"
          className="text-[11px] font-bold uppercase tracking-wide text-ink-soft"
        >
          Profile photo
        </label>
        <input
          id="avatar-upload"
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="Upload profile photo"
          onChange={handleFileChange}
          className="border-[3px] border-ink bg-paper px-3 py-2 text-sm font-bold text-ink outline-none file:mr-3 file:border-[3px] file:border-ink file:bg-acid file:px-2 file:py-1 file:text-[11px] file:font-bold file:uppercase file:tracking-wide"
        />
        {previewUrl && (
          // previewUrl is a client-side blob: object URL (URL.createObjectURL),
          // not a remote image; next/image's optimizer can't fetch/transform a
          // blob: URL.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="New profile photo preview"
            className="h-16 w-16 border-[3px] border-ink object-cover"
          />
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="hard-shadow-sm border-[3px] border-ink bg-acid px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-ink transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save profile"}
        </button>
        {status.kind === "success" && (
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink">{status.message}</p>
        )}
        {status.kind === "error" && (
          <p className="text-[11px] font-bold uppercase tracking-wide text-red-600">{status.message}</p>
        )}
      </div>
    </form>
  );
}
