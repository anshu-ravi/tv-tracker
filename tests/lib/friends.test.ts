import { describe, expect, it } from "vitest";
import {
  formatFriendCode,
  normalizeFriendCode,
  normalizeHandle,
  relationTo,
  sanitizeSearchTerm,
  type FriendsState,
  type Profile,
} from "@/lib/friends";
import { safeNext } from "@/lib/safeNext";

const profile = (id: string): Profile => ({ id, handle: id, display_name: id, avatar_url: null });

describe("normalizeHandle", () => {
  it("lowercases, strips a leading @ and accepts valid handles", () => {
    expect(normalizeHandle("  @Anshu-R ")).toBe("anshu-r");
    expect(normalizeHandle("abc")).toBe("abc");
  });

  it("rejects handles that break the DB format rule", () => {
    expect(normalizeHandle("ab")).toBeNull();
    expect(normalizeHandle("-abc")).toBeNull();
    expect(normalizeHandle("abc-")).toBeNull();
    expect(normalizeHandle("a b c")).toBeNull();
    expect(normalizeHandle("x".repeat(25))).toBeNull();
    expect(normalizeHandle(42)).toBeNull();
  });
});

describe("normalizeFriendCode", () => {
  it("accepts lowercase and the display dash", () => {
    expect(normalizeFriendCode("k7qx-92mb")).toBe("K7QX92MB");
  });

  it("rejects ambiguous characters and wrong lengths", () => {
    expect(normalizeFriendCode("K7QX92M0")).toBeNull();
    expect(normalizeFriendCode("K7QX92M")).toBeNull();
    expect(normalizeFriendCode(undefined)).toBeNull();
  });

  it("round-trips with formatFriendCode", () => {
    expect(normalizeFriendCode(formatFriendCode("K7QX92MB"))).toBe("K7QX92MB");
  });
});

describe("sanitizeSearchTerm", () => {
  it("drops PostgREST filter syntax characters", () => {
    expect(sanitizeSearchTerm("an,shu)%*.(")).toBe("anshu");
    expect(sanitizeSearchTerm("@fagotinho")).toBe("fagotinho");
    expect(sanitizeSearchTerm("José")).toBe("José");
  });
});

describe("relationTo", () => {
  const state: FriendsState = {
    me: profile("me"),
    friendCode: "K7QX92MB",
    friends: [{ profile: profile("f"), since: "" }],
    incoming: [{ id: "r1", profile: profile("in"), created_at: "" }],
    outgoing: [{ id: "r2", profile: profile("out"), created_at: "" }],
  };

  it("classifies every relationship", () => {
    expect(relationTo(state, "me")).toBe("self");
    expect(relationTo(state, "f")).toBe("friend");
    expect(relationTo(state, "in")).toBe("incoming");
    expect(relationTo(state, "out")).toBe("outgoing");
    expect(relationTo(state, "stranger")).toBe("none");
  });
});

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/add/K7QX92MB")).toBe("/add/K7QX92MB");
  });

  it("falls back to / for anything that could leave the site or loop", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("/login")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
