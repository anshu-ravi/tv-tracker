import { describe, expect, it } from "vitest";
import { classifyBucket } from "@/app/(app)/page";

// Pure bucketing decision for Currently Watching's "Up Next" vs "Catch Up"
// split — based on the owner's last watched_at for a title, not episode air
// dates. See CATCHUP_THRESHOLD_DAYS in src/app/(app)/page.tsx.
describe("classifyBucket", () => {
  const today = "2026-08-02";

  it("buckets a never-watched title as upnext", () => {
    expect(classifyBucket(null, today)).toBe("upnext");
  });

  it("buckets a title watched 10 days ago as upnext", () => {
    expect(classifyBucket("2026-07-23T00:00:00Z", today)).toBe("upnext");
  });

  it("buckets a title watched 31 days ago as catchup", () => {
    expect(classifyBucket("2026-07-02T00:00:00Z", today)).toBe("catchup");
  });

  it("buckets a title watched exactly 30 days ago as upnext (boundary)", () => {
    expect(classifyBucket("2026-07-03T00:00:00Z", today)).toBe("upnext");
  });
});
