// Simple on-disk JSON cache for provider API responses, keyed by a filename
// derived from the request. Lets --execute reuse everything the dry run
// already fetched without hitting TMDB/AniList again.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, "../.cache");

function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function safeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  ensureCacheDir();
  const file = path.join(CACHE_DIR, `${safeKey(key)}.json`);
  if (existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, "utf-8")) as T;
    } catch {
      // fall through and re-fetch on a corrupt cache entry
    }
  }
  const result = await fetcher();
  writeFileSync(file, JSON.stringify(result, null, 2));
  return result;
}
