// Anime-only canon/filler/mixed tag, sourced from animefillerlist.com.
// Shared between the title detail episode list and the Home "next episode"
// line — a small, hard-bordered Bold-styled tag.

export type FillerType = "canon" | "filler" | "mixed";

// Bold-styled tag classes per filler type — small, hard-bordered, fits
// inline next to the episode label on a phone-width row.
export const FILLER_TAG_CLASS: Record<FillerType, string> = {
  canon: "bg-acid text-ink",
  filler: "bg-[#ff5c39] text-ink",
  mixed: "bg-panel text-ink-soft",
};

export default function FillerTag({ type }: { type: FillerType }) {
  return (
    <span
      className={`shrink-0 border-2 border-ink px-1 py-0.5 text-[8px] font-bold uppercase leading-none ${FILLER_TAG_CLASS[type]}`}
    >
      {type}
    </span>
  );
}
