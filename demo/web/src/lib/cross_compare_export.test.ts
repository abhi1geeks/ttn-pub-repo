import { describe, expect, it } from "vitest";
import { buildCrossCompareCsv, parseMarkdownPipeTable } from "./cross_compare_export";

describe("cross_compare_export", () => {
  it("parseMarkdownPipeTable reads pipe rows", () => {
    const rows = parseMarkdownPipeTable("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(["A", "B"]);
    expect(rows[1]).toEqual(["1", "2"]);
  });

  it("buildCrossCompareCsv includes meta and table", () => {
    const csv = buildCrossCompareCsv({
      topic: "RG limits",
      headline: "Compare",
      markdownTable: "| Jurisdiction | Requirement |\n|---|---|\n| UK | 24h |\n| MT | 48h |",
      narrative: "Summary text",
    });
    expect(csv).toContain("RG limits");
    expect(csv).toContain("UK");
    expect(csv).toContain("comparison");
  });
});
