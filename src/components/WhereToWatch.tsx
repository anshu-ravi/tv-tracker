import Link from "next/link";
import ProviderLogo from "@/components/ProviderLogo";
import { getTitleStreamingProviders } from "@/lib/tmdb";
import { splitByMine, type WatchProvider, type WatchSettings } from "@/lib/watchSettings";
import type { MediaType } from "@/lib/types";

const note = "text-[9px] font-bold uppercase leading-tight tracking-wide text-ink-soft";

function Logos({ providers, size }: { providers: WatchProvider[]; size: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {providers.map((p) => (
        <span key={p.id} title={p.name}>
          <ProviderLogo provider={p} size={size} />
        </span>
      ))}
    </div>
  );
}

// Logos of the subscription services carrying a title, filtered to the user's own; sits under the poster.
export default async function WhereToWatch({
  sourceId,
  mediaType,
  settings,
}: {
  sourceId: string;
  mediaType: MediaType;
  settings: WatchSettings;
}) {
  if (!settings.region) {
    return (
      <Link href="/account/streaming" className={`${note} underline`}>
        Set country for where to watch →
      </Link>
    );
  }

  let providers: WatchProvider[];
  try {
    providers = await getTitleStreamingProviders(sourceId, mediaType, settings.region);
  } catch (error) {
    console.error("Where-to-watch lookup failed:", error);
    return null;
  }

  if (providers.length === 0) {
    return <p className={note}>Not streaming in {settings.region}</p>;
  }

  const hasPicks = settings.providerIds.length > 0;
  const { mine, others } = splitByMine(providers, settings.providerIds);

  if (hasPicks && mine.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <p className={note}>Not on yours</p>
        <Logos providers={others} size={26} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Logos providers={hasPicks ? mine : providers} size={44} />
      {!hasPicks && (
        <Link href="/account/streaming" className={`${note} underline`}>
          Pick yours →
        </Link>
      )}
    </div>
  );
}
