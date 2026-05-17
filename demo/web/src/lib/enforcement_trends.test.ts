import { describe, expect, it } from "vitest";
import { ENFORCEMENT_FEED } from "../data/enforcement_feed";
import { buildEnforcementTrendSummary, parseTrendDirection } from "./enforcement_trends";

describe("enforcement_trends", () => {
  it("parseTrendDirection reads demo labels", () => {
    expect(parseTrendDirection("Up vs prior quarter (demo)")).toBe("up");
    expect(parseTrendDirection("Stable vs prior quarter (demo)")).toBe("stable");
    expect(parseTrendDirection("New category this quarter (demo)")).toBe("new");
  });

  it("buildEnforcementTrendSummary aggregates feed", () => {
    const s = buildEnforcementTrendSummary(ENFORCEMENT_FEED);
    expect(s.total).toBe(ENFORCEMENT_FEED.length);
    expect(s.up).toBeGreaterThanOrEqual(1);
    expect(s.hotspots.length).toBeGreaterThanOrEqual(1);
    expect(s.narrative.length).toBeGreaterThan(10);
  });
});
