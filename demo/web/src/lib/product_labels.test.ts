import { describe, expect, it } from "vitest";
import {
  featureById,
  featureDisplayName,
  INGEST_WORKFLOW_PHRASE,
  sectionTitle,
} from "./product_labels";

describe("product_labels", () => {
  it("resolves known feature ids to featureName", () => {
    expect(featureDisplayName("1.1")).toBe("Smart Regulatory Source Library");
    expect(featureDisplayName("2.3")).toBe("Cross-Jurisdictional Comparison");
    expect(sectionTitle("1.5")).toBe("Horizon Scanning");
  });

  it("featureById returns row", () => {
    const row = featureById("2.4");
    expect(row?.module).toBe("AI Research & Intelligence");
    expect(row?.featureName).toBe("Regulatory Gap Analysis");
  });

  it("humanizes unknown ids", () => {
    expect(featureDisplayName("9.9")).toBe("9 9");
  });

  it("exposes ingest workflow phrase", () => {
    expect(INGEST_WORKFLOW_PHRASE).toBe("ingest workflow");
  });
});
