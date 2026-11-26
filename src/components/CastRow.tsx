import Image from "next/image";
import type { TitleCredits } from "@/lib/types";
import { buildTmdbImageUrl } from "@/lib/tmdbImage";

// Horizontally scrolling cast cards under a "Cast" heading.
export default function CastRow({
  cast,
  unoptimized = false,
}: {
  cast: TitleCredits["cast"];
  unoptimized?: boolean;
}) {
  if (cast.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="display px-4 text-xl">Cast</h2>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {cast.map((member, i) => (
          <div key={`${member.name}-${i}`} className="w-[72px] shrink-0 overflow-hidden border-2 border-ink bg-paper">
            <div className="relative aspect-[2/3] w-full overflow-hidden border-b-2 border-ink bg-panel">
              {member.imageUrl ? (
                <Image
                  src={unoptimized ? buildTmdbImageUrl(member.imageUrl, 160) : member.imageUrl}
                  alt={member.name}
                  fill
                  sizes="72px"
                  className="object-cover"
                  unoptimized={unoptimized}
                />
              ) : null}
            </div>
            <p className="truncate px-1 pt-0.5 text-[9px] font-bold uppercase">{member.name}</p>
            {member.role && <p className="truncate px-1 pb-1 text-[8px] text-ink-soft">{member.role}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
