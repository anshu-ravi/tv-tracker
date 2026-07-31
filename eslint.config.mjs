import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Supabase Edge Functions target the Deno runtime (npm: imports, Deno
    // globals) — not the Next app's Node/TS toolchain, so don't lint them here.
    "supabase/functions/**",
    // Agent git worktrees live inside the repo; never lint their copies.
    ".claude/**",
  ]),
]);

export default eslintConfig;
