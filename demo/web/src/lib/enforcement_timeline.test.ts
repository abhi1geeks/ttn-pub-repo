import { describe, expect, it } from "vitest";
import { ENFORCEMENT_FEED } from "../data/enforcement_feed";
import { buildEnforcementTimeline } from "./enforcement_timeline";

describe("enforcement_timeline", () => {
  it("groups actions by month", () => {
    const buckets = buildEnforcementTimeline(ENFORCEMENT_FEED);
    expect(buckets.length).toBeGreaterThanOrEqual(2);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(ENFORCEMENT_FEED.length);
  });
});
