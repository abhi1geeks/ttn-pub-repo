import { describe, expect, it } from "vitest";
import { buildRunEvidenceExport, runToEvidenceSlice } from "./run_evidence_export";

describe("run_evidence_export", () => {
  it("runToEvidenceSlice maps ingest metadata", () => {
    const s = runToEvidenceSlice({
      timestamp: "2026-01-01T00:00:00Z",
      versionId: "v1",
      documentHash: "abc",
      runPointId: "rp1",
      summary: { newChunks: 2, removedChunks: 1, totalChunks: 10 },
      sourceIngest: { httpStatus: 200, jurisdiction: "NV" },
      materialityScore: 77,
      hitlReview: { status: "acknowledged", reason: "ok" },
    });
    expect(s.materialityScore).toBe(77);
    expect(s.hitlReview?.status).toBe("acknowledged");
    expect(s.sourceIngest?.jurisdiction).toBe("NV");
  });

  it("buildRunEvidenceExport includes schema and impact overlay", () => {
    const out = buildRunEvidenceExport({
      documentUrl: "https://example.com/doc.pdf",
      current: runToEvidenceSlice({ versionId: "x" }),
      impactDisplay: { materialityScore: 42, stub: true },
    });
    expect(out.schema).toBe("gli.run-evidence.v1");
    expect(out.documentUrl).toContain("example.com");
    expect(out.impactDisplay?.materialityScore).toBe(42);
    expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
