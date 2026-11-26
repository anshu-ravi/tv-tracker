import { getRegionProviders } from "@/lib/tmdb";
import type { WatchSettings } from "@/lib/watchSettings";

// "ES · Netflix, Crunchyroll" for the Streaming row; names come from TMDB's day-cached provider list.
export default async function StreamingSubtitle({ settings }: { settings: WatchSettings }) {
  if (!settings.region) return <>Not set up</>;
  if (settings.providerIds.length === 0) return <>{settings.region} · No services picked</>;
  let names: string[] = [];
  try {
    const providers = await getRegionProviders(settings.region);
    const picked = new Set(settings.providerIds);
    names = providers.filter((p) => picked.has(p.id)).map((p) => p.name);
  } catch (err) {
    console.error("Streaming subtitle lookup failed:", err);
  }
  const list = names.length ? names.join(", ") : `${settings.providerIds.length} services`;
  return (
    <>
      {settings.region} · {list}
    </>
  );
}
