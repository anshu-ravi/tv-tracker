import Image from "next/image";
import BackButton from "@/components/BackButton";

// Backdrop with the poster overlapping its bottom edge, title and a plain meta line beside it.
export default function TitleHero({
  title,
  meta,
  backdropSrc,
  posterSrc,
  unoptimized = false,
}: {
  title: string;
  meta: string;
  backdropSrc: string | null;
  posterSrc: string | null;
  unoptimized?: boolean;
}) {
  return (
    <>
      {backdropSrc ? (
        <div className="relative aspect-[16/9] w-full overflow-hidden border-b-[3px] border-ink bg-panel">
          <Image src={backdropSrc} alt="" fill sizes="100vw" className="object-cover" priority unoptimized={unoptimized} />
          <div className="absolute left-4 top-4">
            <BackButton />
          </div>
        </div>
      ) : (
        <div className="px-4 pt-4">
          <BackButton />
        </div>
      )}

      <div className="flex items-end gap-4 px-4 pt-3">
        <div
          className={`hard-shadow relative z-10 h-36 w-24 shrink-0 overflow-hidden border-[3px] border-ink bg-panel ${
            backdropSrc ? "-mt-16" : ""
          }`}
        >
          {posterSrc ? (
            <Image src={posterSrc} alt={title} fill sizes="96px" className="object-cover" unoptimized={unoptimized} />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pb-1">
          <h1 className="display text-2xl leading-tight">{title}</h1>
          {meta && <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">{meta}</p>}
        </div>
      </div>
    </>
  );
}
