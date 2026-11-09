import { describe, expect, it } from "vitest";
import {
  MAX_PROVIDERS,
  isValidProviderIds,
  isValidRegion,
  parseWatchSettings,
  splitByMine,
} from "@/lib/watchSettings";

describe("isValidRegion", () => {
  it("accepts two uppercase letters only", () => {
    expect(isValidRegion("IN")).toBe(true);
    expect(isValidRegion("in")).toBe(false);
    expect(isValidRegion("IND")).toBe(false);
    expect(isValidRegion(null)).toBe(false);
  });
});

describe("isValidProviderIds", () => {
  it("accepts positive integers up to the cap", () => {
    expect(isValidProviderIds([])).toBe(true);
    expect(isValidProviderIds([8, 119])).toBe(true);
    expect(isValidProviderIds([8, 1.5])).toBe(false);
    expect(isValidProviderIds([0])).toBe(false);
    expect(isValidProviderIds(["8"])).toBe(false);
    expect(isValidProviderIds(Array.from({ length: MAX_PROVIDERS + 1 }, (_, i) => i + 1))).toBe(false);
  });
});

describe("parseWatchSettings", () => {
  it("reads valid metadata", () => {
    expect(parseWatchSettings({ watch_region: "GB", watch_providers: [8, 337] })).toEqual({
      region: "GB",
      providerIds: [8, 337],
    });
  });

  it("falls back to defaults for missing or malformed values", () => {
    expect(parseWatchSettings(undefined)).toEqual({ region: null, providerIds: [] });
    expect(parseWatchSettings({ watch_region: "gb", watch_providers: "8" })).toEqual({
      region: null,
      providerIds: [],
    });
  });
});

describe("splitByMine", () => {
  const p = (id: number) => ({ id, name: `P${id}`, logoUrl: null });

  it("splits providers into owned and not owned, keeping order", () => {
    expect(splitByMine([p(8), p(9), p(337)], [337, 8])).toEqual({
      mine: [p(8), p(337)],
      others: [p(9)],
    });
  });
});
