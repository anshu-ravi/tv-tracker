import Link from "next/link";
import ProviderLogo from "@/components/ProviderLogo";
import { StripCell } from "@/components/RatingsStrip";
import { getTitleStreamingProviders } from "@/lib/tmdb";
import { splitByMine, type WatchProvider, type WatchSettings } from "@/lib/watchSettings";
import type { MediaType } from "@/lib/types";

const quiet = "text-[11px] font-bold uppercase leading-tight text-ink-soft";

function FirstLogo({ providers }: { providers: WatchProvider[] }) {
  const [first] = providers;
  return (
    <>
      <span title={providers.map((p) => p.name).join(", ")}>
        <ProviderLogo provider={first} size={22} />
      </span>
      {providers.length > 1 && <span className="text-xs">+{providers.length - 1}</span>}
    </>
  );
}

export function WhereToWatchFallback() {
  return (
    <StripCell label="On">
      <span className="h-[22px] w-[22px] animate-pulse rounded-[6px] border-2 border-ink bg-panel" />
    </StripCell>
  );
}

// Ratings-strip cell naming the subscription services that carry a title, preferring the user's own.
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
      <StripCell label="Watch">
        <Link href="/account/streaming" className={`${quiet} underline`}>
          Set country
        </Link>
      </StripCell>
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
    return (
      <StripCell label="Watch">
        <span className={quiet}>Not streaming</span>
      </StripCell>
    );
  }

  const hasPicks = settings.providerIds.length > 0;
  const { mine, others } = splitByMine(providers, settings.providerIds);

  if (hasPicks && mine.length === 0) {
    return (
      <StripCell label="Not on yours">
        <FirstLogo providers={others} />
      </StripCell>
    );
  }

  return (
    <StripCell label="On">
      <FirstLogo providers={hasPicks ? mine : providers} />
    </StripCell>
  );
}
