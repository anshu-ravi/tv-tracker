// Env loading for the backfill script. Same convention as
// scripts/refresh-catalog/lib/env.ts: load .env.local then .env from the
// repo root, fail loudly listing exactly what's missing. No TMDB_API_KEY
// here — this script never calls TMDB, only animefillerlist.com + Supabase.

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

config({ path: path.join(REPO_ROOT, ".env.local") });
config({ path: path.join(REPO_ROOT, ".env") });

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  TARGET_USER_ID: string;
}

export function loadEnv(): Env {
  const missing: string[] = [];

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");

  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  const TARGET_USER_ID = process.env.TARGET_USER_ID ?? "";
  if (!TARGET_USER_ID) missing.push("TARGET_USER_ID");

  if (missing.length > 0) {
    console.error(
      `\nMissing required environment variable(s):\n` +
        missing.map((m) => `  - ${m}`).join("\n") +
        `\n\nSet them in .env.local or .env at the repo root and re-run.\n`,
    );
    process.exit(1);
  }

  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TARGET_USER_ID };
}
