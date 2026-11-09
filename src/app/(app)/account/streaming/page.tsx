import { createClient } from "@/lib/supabase/server";
import { getRegionProviders, getWatchRegions } from "@/lib/tmdb";
import { parseWatchSettings } from "@/lib/watchSettings";
import BackButton from "@/components/BackButton";
import StreamingSettings from "@/components/StreamingSettings";

export default async function StreamingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const settings = parseWatchSettings(data?.claims?.user_metadata);

  const [regions, providers] = await Promise.all([
    getWatchRegions(),
    settings.region ? getRegionProviders(settings.region) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <BackButton fallbackHref="/account" />
      <h1 className="display mb-4 mt-4 text-3xl">Streaming</h1>
      <StreamingSettings
        regions={regions}
        initialRegion={settings.region}
        initialProviders={providers}
        initialSelected={settings.providerIds}
      />
    </div>
  );
}
