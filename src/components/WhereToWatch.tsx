import Link from "next/link";
import ProviderLogo from "@/components/ProviderLogo";
import { getTitleStreamingProviders } from "@/lib/tmdb";
import { splitByMine, type WatchProvider, type WatchSettings } from "@/lib/watchSettings";
import type { MediaType } from "@/lib/types";

const label = "text-[10px] font-bold uppercase tracking-wide text-ink-soft";

function Logos({ providers, size }: { providers: WatchProvider[]; size: number }) {
  return (
    <>
      {providers.map((p) => (
        <span key={p.id} title={p.name}>
          <ProviderLogo provider={p} size={size} />
        </span>
      ))}
    </>
  );
}

// Inline row of the subscription services carrying a title, filtered to the user's own.
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
      <Link href="/account/streaming" className={`${label} underline`}>
        Set your country for where to watch →
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

  const region = settings.region;
  const attribution = <span className="text-[8px] font-bold uppercase text-ink-soft">via JustWatch</span>;

  if (providers.length === 0) {
    return <p className={label}>Not streaming in {region}</p>;
  }

  const hasPicks = settings.providerIds.length > 0;
  const { mine, others } = splitByMine(providers, settings.providerIds);

  if (hasPicks && mine.length === 0) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={label}>Not on yours · {region}</span>
        <Logos providers={others} size={22} />
        {attribution}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={label}>Watch · {region}</span>
      <Logos providers={hasPicks ? mine : providers} size={30} />
      {attribution}
      {!hasPicks && (
        <Link href="/account/streaming" className={`${label} underline`}>
          Pick yours →
        </Link>
      )}
    </div>
  );
}
