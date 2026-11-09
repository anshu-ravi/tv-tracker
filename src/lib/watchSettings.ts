// Per-account "where to watch" settings (country + subscribed services), stored in auth user_metadata.

export interface WatchProvider {
  id: number;
  name: string;
  logoUrl: string | null;
}

export interface WatchSettings {
  region: string | null;
  providerIds: number[];
}

export const MAX_PROVIDERS = 100;

export function isValidRegion(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

export function isValidProviderIds(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_PROVIDERS &&
    value.every((id) => Number.isInteger(id) && id > 0)
  );
}

// Reads settings from user_metadata, ignoring anything malformed.
export function parseWatchSettings(metadata: unknown): WatchSettings {
  const meta = (metadata ?? {}) as Record<string, unknown>;
  return {
    region: isValidRegion(meta.watch_region) ? meta.watch_region : null,
    providerIds: isValidProviderIds(meta.watch_providers) ? meta.watch_providers : [],
  };
}

// Splits a title's providers into the ones the user subscribes to and the rest.
export function splitByMine(
  available: WatchProvider[],
  mine: number[],
): { mine: WatchProvider[]; others: WatchProvider[] } {
  const owned = new Set(mine);
  return {
    mine: available.filter((p) => owned.has(p.id)),
    others: available.filter((p) => !owned.has(p.id)),
  };
}
