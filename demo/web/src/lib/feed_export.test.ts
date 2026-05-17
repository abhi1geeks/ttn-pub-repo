import { describe, expect, it } from "vitest";
import { ENFORCEMENT_FEED } from "../data/enforcement_feed";
import { HORIZON_FEED } from "../data/horizon_feed";
import { buildEnforcementFeedCsv, buildHorizonFeedCsv } from "./feed_export";

describe("feed_export", () => {
  it("buildHorizonFeedCsv includes header and rows", () => {
    const csv = buildHorizonFeedCsv(HORIZON_FEED);
    expect(csv.split("\n").length).toBe(HORIZON_FEED.length + 1);
    expect(csv).toContain("jurisdiction");
    expect(csv).toContain("hz-001");
  });

  it("buildEnforcementFeedCsv includes trend direction", () => {
    const csv = buildEnforcementFeedCsv(ENFORCEMENT_FEED);
    expect(csv).toContain("trend_direction_demo");
    expect(csv).toContain("enf-001");
  });
});
