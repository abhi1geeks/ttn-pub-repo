import { describe, expect, it } from "vitest";
import { buildGapAnalysisMarkdown } from "./gap_report_export";

describe("gap_report_export", () => {
  it("builds markdown with gaps", () => {
    const md = buildGapAnalysisMarkdown(
      {
        executive_summary: "Exec text.",
        gaps: [
          {
            title: "Logging",
            severity: "high",
            description: "Gap desc",
            recommended_action: "Fix logs",
          },
        ],
      },
      { productLine: "online" },
    );
    expect(md).toContain("# Regulatory gap analysis");
    expect(md).toContain("Exec text.");
    expect(md).toContain("**Severity:** high");
    expect(md).toContain("Fix logs");
  });
});
