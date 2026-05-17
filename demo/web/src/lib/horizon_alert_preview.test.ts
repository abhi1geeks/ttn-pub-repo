import { describe, expect, it } from "vitest";
import { HORIZON_FEED } from "../data/horizon_feed";
import { buildHorizonAlertPreview } from "./horizon_alert_preview";

describe("horizon_alert_preview", () => {
  it("builds digest for watched items", () => {
    const text = buildHorizonAlertPreview(HORIZON_FEED.slice(0, 2));
    expect(text).toContain("Subject:");
    expect(text).toContain("Malta");
  });

  it("handles empty watchlist", () => {
    expect(buildHorizonAlertPreview([])).toContain("No instruments");
  });
});
