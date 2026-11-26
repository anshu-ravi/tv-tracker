// fetch wrapper that retries once when PostgREST rejects a just-minted JWT (PGRST303).

export const PGRST303_RETRY_DELAY_MS = 1000;

async function isFreshTokenRejection(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  // HEAD responses have no body, so check the gateway header first.
  if (res.headers.get("proxy-status")?.includes("PGRST303")) return true;
  try {
    const body = await res.clone().json();
    return body?.code === "PGRST303";
  } catch {
    return false;
  }
}

export function createRetryFetch(
  baseFetch: typeof fetch = fetch,
  delayMs = PGRST303_RETRY_DELAY_MS,
): typeof fetch {
  return async (input, init) => {
    const res = await baseFetch(input, init);
    if (!(await isFreshTokenRejection(res))) return res;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return baseFetch(input, init);
  };
}
