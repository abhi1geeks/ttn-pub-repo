import { describe, expect, it } from "vitest";
import { GLI_FEATURES, groupFeaturesByModule } from "./gli_features";

describe("gli_features", () => {
  it("has 10 rows with stable ids", () => {
    expect(GLI_FEATURES).toHaveLength(10);
    expect(GLI_FEATURES.map((r) => r.id)).toEqual([
      "1.1",
      "1.2",
      "1.3",
      "1.4",
      "1.5",
      "2.1",
      "2.2",
      "2.3",
      "2.4",
      "2.5",
    ]);
  });

  it("groups into two modules", () => {
    const g = groupFeaturesByModule(GLI_FEATURES);
    expect(g.size).toBe(2);
    expect([...g.keys()].sort()).toEqual(["AI Research & Intelligence", "Regulatory Change Monitoring"]);
  });

  it("each row has non-empty copy for all CSV-aligned fields", () => {
    for (const r of GLI_FEATURES) {
      expect(r.module.trim().length).toBeGreaterThan(0);
      expect(r.featureName.trim().length).toBeGreaterThan(0);
      expect(r.description.trim().length).toBeGreaterThan(0);
      expect(r.whyGliNeedsIt.trim().length).toBeGreaterThan(0);
    }
  });
});
