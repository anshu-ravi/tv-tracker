import { describe, expect, it, vi } from "vitest";
import { createRetryFetch } from "@/lib/supabase/retryFetch";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("createRetryFetch", () => {
  it("passes a successful response straight through", async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(200, []));
    const res = await createRetryFetch(base, 0)("https://x/rest/v1/t");
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("retries once on a PGRST303 body", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: "PGRST303" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const init = { method: "POST", body: "{}" };
    const res = await createRetryFetch(base, 0)("https://x/rest/v1/rpc/f", init);
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base).toHaveBeenLastCalledWith("https://x/rest/v1/rpc/f", init);
  });

  it("retries on a bodyless HEAD 401 flagged by the proxy-status header", async () => {
    const base = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 401, headers: { "proxy-status": "PostgREST; error=PGRST303" } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const res = await createRetryFetch(base, 0)("https://x/rest/v1/t", { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(2);
  });

  it("does not retry other 401s", async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(401, { code: "PGRST301" }));
    const res = await createRetryFetch(base, 0)("https://x/rest/v1/t");
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(1);
  });

  it("retries only once, returning the second failure", async () => {
    const base = vi.fn().mockResolvedValue(jsonResponse(401, { code: "PGRST303" }));
    const res = await createRetryFetch(base, 0)("https://x/rest/v1/t");
    expect(res.status).toBe(401);
    expect(base).toHaveBeenCalledTimes(2);
  });
});
