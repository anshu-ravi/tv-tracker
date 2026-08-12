import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session on every request and gates the app behind auth.
// Unauthenticated users are redirected to /login (except auth routes themselves).
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getClaims() must run to refresh the token; don't add logic
  // between client creation and this call.
  //
  // getClaims() (unlike getUser()) verifies the JWT locally against the
  // project's JWKS (cached after the first fetch) when the project uses
  // asymmetric signing keys — which this project's Auth server does (ES256)
  // — so it avoids a network round trip to the Auth server on every request.
  // It still refreshes the session first if the access token is close to
  // expiring, so the cookie-refresh contract this function exists for is
  // preserved exactly like getUser() provided it.
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!data?.claims && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
