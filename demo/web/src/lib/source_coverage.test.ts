import { describe, expect, it } from "vitest";
import { flattenSourcesCatalog, SOURCES_CATALOG } from "../data/sources_catalog";
import { DEMO_CANONICAL_PDF } from "./document_url";
import { buildSourceCoverage } from "./source_coverage";

describe("source_coverage", () => {
  it("counts ingested catalogue URLs", () => {
    const flat = flattenSourcesCatalog(SOURCES_CATALOG);
    const report = buildSourceCoverage(flat, [DEMO_CANONICAL_PDF]);
    expect(report.total).toBe(flat.length);
    expect(report.ingested).toBeGreaterThanOrEqual(1);
    expect(report.regions.length).toBeGreaterThan(0);
    expect(report.customTotal).toBe(0);
    expect(report.customIngested).toBe(0);
  });
});
