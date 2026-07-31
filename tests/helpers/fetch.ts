// Small helper for building fetch mocks in provider client tests. Not a test
// file itself (lives outside the `tests/**/*.test.ts` glob vitest runs).

/** Build a minimal `Response`-like object satisfying the subset of the Fetch
 * API our provider clients use (`res.ok`, `res.status`, `res.json()`). */
export function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}
