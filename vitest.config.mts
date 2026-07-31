import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors the `@/*` -> `./src/*` alias from tsconfig.json so tests can import
// app code (e.g. `@/lib/tmdb`) the same way the app does.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next's server bundler resolves "server-only" to a no-op via the
      // "react-server" export condition; under plain Node it resolves to
      // `index.js`, which unconditionally throws. Point it at the package's
      // own no-op (`empty.js`, used for that condition) so importing lib/API
      // modules that guard themselves with `import "server-only"` works
      // under Vitest too.
      "server-only": fileURLToPath(
        new URL("./node_modules/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
