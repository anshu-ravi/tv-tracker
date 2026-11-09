// Rating bands used to group the ratings list and colour rating stickers.

export type TierKey = "must" | "great" | "good" | "meh" | "skip";

export interface Tier {
  key: TierKey;
  label: string;
  range: string;
  min: number;
}

export const TIERS: Tier[] = [
  { key: "must", label: "Must-watch", range: "4.5+", min: 4.5 },
  { key: "great", label: "Great", range: "4.0–4.4", min: 4.0 },
  { key: "good", label: "Good", range: "3.5–3.9", min: 3.5 },
  { key: "meh", label: "Meh", range: "3.0–3.4", min: 3.0 },
  { key: "skip", label: "Skip", range: "under 3", min: 0 },
];

// Background classes per tier; also used to recolour `.stamp`.
export const TIER_BG: Record<TierKey, string> = {
  must: "bg-acid",
  great: "bg-gold",
  good: "bg-bronze",
  meh: "bg-silver",
  skip: "bg-dnf",
};

export function tierFor(rating: number): Tier {
  // Compare in tenths so 4.5 stored as 4.4999… still lands in the right band.
  const tenths = Math.round(rating * 10);
  return TIERS.find((t) => tenths >= Math.round(t.min * 10)) ?? TIERS[TIERS.length - 1];
}

// Splits an already-sorted list into consecutive runs sharing a tier, keeping order.
export function groupByTier<T extends { rating: number }>(items: T[]): { tier: Tier; items: T[] }[] {
  const groups: { tier: Tier; items: T[] }[] = [];
  for (const item of items) {
    const tier = tierFor(item.rating);
    const last = groups[groups.length - 1];
    if (last && last.tier.key === tier.key) last.items.push(item);
    else groups.push({ tier, items: [item] });
  }
  return groups;
}
