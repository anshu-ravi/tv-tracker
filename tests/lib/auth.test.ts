import { afterEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../helpers/fakeSupabase";

const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mockCreateClient }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("requireUser", () => {
  it("verifies the session via getClaims (local JWT verification), not getUser", async () => {
    const fake = createFakeSupabase({ user: { id: "user-1" } });
    mockCreateClient.mockResolvedValue(fake);

    const { requireUser } = await import("@/lib/api/auth");
    const auth = await requireUser();

    expect(fake.auth.getClaims).toHaveBeenCalledTimes(1);
    expect(fake.auth.getUser).not.toHaveBeenCalled();
    expect(auth.response).toBeNull();
    expect(auth.user).toEqual({ id: "user-1" });
  });

  it("returns a 401 response when there are no claims (signed out)", async () => {
    mockCreateClient.mockResolvedValue(createFakeSupabase({ user: null }));

    const { requireUser } = await import("@/lib/api/auth");
    const auth = await requireUser();

    expect(auth.user).toBeNull();
    expect(auth.response).not.toBeNull();
    expect(auth.response?.status).toBe(401);
  });

  it("returns a 401 response when getClaims errors", async () => {
    mockCreateClient.mockResolvedValue(
      createFakeSupabase({ user: { id: "user-1" }, authError: { message: "bad jwt" } }),
    );

    const { requireUser } = await import("@/lib/api/auth");
    const auth = await requireUser();

    expect(auth.user).toBeNull();
    expect(auth.response?.status).toBe(401);
  });
});
