// Env loading for the import tool. Loads .env.local then .env (matching the
// app's convention: NEXT_PUBLIC_* / TMDB_API_KEY live in one or the other
// depending on the machine). Fails loudly listing exactly what's missing —
// dry run and --execute have different requirements.

import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");

// Load quietly; later files do NOT override earlier ones, so load .env.local
// first (most specific / most likely to hold real values) then fall back to
// .env for anything still unset.
config({ path: path.join(REPO_ROOT, ".env.local") });
config({ path: path.join(REPO_ROOT, ".env") });

export interface Env {
  TMDB_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TARGET_USER_ID?: string;
}

export function loadEnv(mode: "dry-run" | "execute"): Env {
  const missing: string[] = [];

  const TMDB_API_KEY = process.env.TMDB_API_KEY ?? "";
  if (!TMDB_API_KEY) missing.push("TMDB_API_KEY");

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");

  let SUPABASE_SERVICE_ROLE_KEY: string | undefined;
  let TARGET_USER_ID: string | undefined;

  if (mode === "execute") {
    SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    TARGET_USER_ID = process.env.TARGET_USER_ID ?? "";
    if (!TARGET_USER_ID) missing.push("TARGET_USER_ID");
  }

  if (missing.length > 0) {
    console.error(
      `\nMissing required environment variable(s) for ${mode}:\n` +
        missing.map((m) => `  - ${m}`).join("\n") +
        `\n\nSet them in .env.local or .env at the repo root and re-run.\n`,
    );
    process.exit(1);
  }

  return {
    TMDB_API_KEY,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    TARGET_USER_ID,
  };
}
