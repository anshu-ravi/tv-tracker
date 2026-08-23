import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Router (client) cache TTL in seconds. Every route here is dynamic
    // (per-request Supabase reads), and BottomNav/LibrarySubnav now force
    // `prefetch={true}` so tab switches feel instant — but that also moves
    // these routes into the `static` TTL bucket (300s default), not
    // `dynamic` (0s default). 30 is the floor Next allows for `static`
    // (schema: gte(30)); using it for both keeps a same-app-instance tab
    // switch fast while capping how long a route NOT freshened by the
    // mutating page's own `router.refresh()` can show stale watch data.
    staleTimes: {
      dynamic: 30,
      static: 30,
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      {
        // Supabase Storage public avatars (see src/app/api/account/profile/route.ts).
        protocol: "https",
        hostname: "ermhfiofisjsrniccqlv.supabase.co",
        pathname: "/storage/v1/object/public/avatars/**",
      },
    ],
  },
};

export default nextConfig;
