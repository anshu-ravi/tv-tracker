import type { MediaType } from "@/lib/types";

// Queue behind /account/resolve: titles an import flagged as "not sure the latest season was watched".

export interface ResolveQueueItem {
  titleId: string;
  title: string;
  mediaType: MediaType;
  posterUrl: string | null;
  seasonNumber: number;
}

/** Alphabetical, so the order is stable across reloads. */
export function buildResolveQueue(items: ResolveQueueItem[]): ResolveQueueItem[] {
  return [...items].sort((a, b) => a.title.localeCompare(b.title));
}
