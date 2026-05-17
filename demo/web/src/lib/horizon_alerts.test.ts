import { describe, expect, it } from "vitest";
import { HORIZON_FEED } from "../data/horizon_feed";
import { horizonAlertHeadline, horizonEarlyWarnings } from "./horizon_alerts";

describe("horizon_alerts", () => {
  it("flags pre-enactment stages", () => {
    const early = horizonEarlyWarnings(HORIZON_FEED);
    expect(early.length).toBe(HORIZON_FEED.length);
    expect(horizonAlertHeadline(early.length)).toContain("4");
  });
});
