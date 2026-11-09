import Link from "next/link";
import ProviderLogo from "@/components/ProviderLogo";
import { getTitleStreamingProviders } from "@/lib/tmdb";
import { splitByMine, type WatchProvider, type WatchSettings } from "@/lib/watchSettings";
import type { MediaType } from "@/lib/types";

function Shell({ region, children }: { region: string | null; children: React.ReactNode }) {
  return (
    <section className="card-bold p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-soft">
          Where to watch{region ? ` · ${region}` : ""}
        </h2>
        <span className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">Data: JustWatch</span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function LogoRow({ providers, size }: { providers: WatchProvider[]; size: number }) {
  return (
    <ul className="flex flex-wrap gap-3">
      {providers.map((p) => (
        <li key={p.id} className="flex flex-col items-center gap-1" style={{ width: size + 8 }}>
          <ProviderLogo provider={p} size={size} />
          {size >= 40 && (
            <span className="line-clamp-2 text-center text-[9px] font-bold uppercase leading-tight">{p.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

const settingsLink = "text-[11px] font-bold uppercase tracking-wide underline";

// Subscription services carrying a title in the user's country, filtered to the ones they have.
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
      <Shell region={null}>
        <Link href="/account/streaming" className={settingsLink}>
          Set your country to see streaming services →
        </Link>
      </Shell>
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
      <Shell region={settings.region}>
        <p className="text-sm text-ink-soft">Not on any subscription service here.</p>
      </Shell>
    );
  }

  if (settings.providerIds.length === 0) {
    return (
      <Shell region={settings.region}>
        <LogoRow providers={providers} size={44} />
        <Link href="/account/streaming" className={`${settingsLink} mt-3 inline-block`}>
          Pick your services →
        </Link>
      </Shell>
    );
  }

  const { mine, others } = splitByMine(providers, settings.providerIds);
  return (
    <Shell region={settings.region}>
      {mine.length > 0 ? (
        <LogoRow providers={mine} size={44} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-ink-soft">Not on your services. Also on:</p>
          <LogoRow providers={others} size={28} />
        </div>
      )}
    </Shell>
  );
}
