import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createRetryFetch } from "./retryFetch";

// Server-side Supabase client (Server Components, Route Handlers, Server Actions).
// Reads/writes the auth cookies via Next's async cookie store.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // See docs/build-logs/decisions.md, "Fresh-token 401s".
      global: { fetch: createRetryFetch() },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In a Server Component the cookie store is read-only; the middleware
          // is responsible for refreshing the session, so swallow the error.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // no-op
          }
        },
      },
    },
  );
}
