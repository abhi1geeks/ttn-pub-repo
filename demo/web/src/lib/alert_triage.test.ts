import { describe, expect, it } from "vitest";
import {
  relevanceTierFromMateriality,
  suggestDemoRoutingQueue,
  topicTagsFromRun,
} from "./alert_triage";

describe("alert_triage", () => {
  it("relevanceTierFromMateriality uses 1–5 materiality scale", () => {
    expect(relevanceTierFromMateriality(undefined)).toBe("unknown");
    expect(relevanceTierFromMateriality(5)).toBe("high");
    expect(relevanceTierFromMateriality(4)).toBe("high");
    expect(relevanceTierFromMateriality(3)).toBe("medium");
    expect(relevanceTierFromMateriality(2)).toBe("low");
    expect(relevanceTierFromMateriality(1)).toBe("low");
  });

  it("suggestDemoRoutingQueue prefers online path", () => {
    expect(suggestDemoRoutingQueue({ productLine: "online", jurisdiction: "" })).toContain("Online");
    expect(suggestDemoRoutingQueue({ productLine: "slots", jurisdiction: "Nevada" })).toContain("Systems");
  });

  it("topicTagsFromRun includes metadata", () => {
    const tags = topicTagsFromRun({ jurisdiction: "MT", productLine: "RNG", effectiveDate: "2026-01-01" });
    expect(tags.some((t) => t.includes("MT"))).toBe(true);
    expect(tags.some((t) => t.includes("RNG"))).toBe(true);
  });
});
