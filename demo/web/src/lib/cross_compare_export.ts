/** CSV export for cross-jurisdictional comparison results (CSV 2.3). */

import { csvRow } from "./csv_util";

export type CrossCompareExportInput = {
  topic: string;
  headline: string;
  markdownTable: string;
  narrative: string;
  modelId?: string;
  stub?: boolean;
};

/** Parse a simple GitHub-flavored markdown pipe table into rows of cells. */
export function parseMarkdownPipeTable(md: string): string[][] {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|") && l.endsWith("|"));
  const dataLines = lines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
  return dataLines.map((line) =>
    line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim()),
  );
}

export function buildCrossCompareCsv(input: CrossCompareExportInput): string {
  const tableRows = parseMarkdownPipeTable(input.markdownTable);
  const sections: string[] = [];

  sections.push(csvRow(["section", "field", "value"]));
  sections.push(csvRow(["meta", "topic", input.topic]));
  sections.push(csvRow(["meta", "headline", input.headline]));
  sections.push(csvRow(["meta", "narrative", input.narrative]));
  if (input.modelId) sections.push(csvRow(["meta", "model_id", input.modelId]));
  sections.push(csvRow(["meta", "stub", String(Boolean(input.stub))]));

  if (tableRows.length) {
    const width = Math.max(...tableRows.map((r) => r.length));
    const header = tableRows[0] ?? [];
    const colNames = header.map((h, i) => h || `column_${i + 1}`);
    while (colNames.length < width) colNames.push(`column_${colNames.length + 1}`);

    sections.push("");
    sections.push(csvRow(["section", ...colNames]));
    for (let i = 1; i < tableRows.length; i += 1) {
      const row = tableRows[i] ?? [];
      const cells = colNames.map((_, ci) => row[ci] ?? "");
      sections.push(csvRow(["comparison", ...cells]));
    }
  }

  return sections.filter((line, idx) => line !== "" || idx === 0).join("\n");
}
