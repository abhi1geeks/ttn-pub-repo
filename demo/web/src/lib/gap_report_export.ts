/** Build downloadable gap-analysis report (CSV 2.4). */

export type GapExportItem = {
  title: string;
  severity: string;
  description: string;
  recommendedAction?: string;
  recommended_action?: string;
};

export type GapExportPayload = {
  executiveSummary?: string;
  executive_summary?: string;
  gaps?: GapExportItem[];
  productLine?: string;
  documentUrl?: string;
};

export function buildGapAnalysisMarkdown(
  payload: GapExportPayload,
  meta?: { productLine?: string; documentUrl?: string },
): string {
  const exec = (payload.executiveSummary ?? payload.executive_summary ?? "").trim();
  const gaps = payload.gaps ?? [];
  const lines: string[] = [
    "# Regulatory gap analysis (demo)",
    "",
    `Generated: ${new Date().toISOString()}`,
  ];
  if (meta?.productLine) lines.push(`Product line: ${meta.productLine}`);
  if (meta?.documentUrl) lines.push(`Scope URL: ${meta.documentUrl}`);
  lines.push("", "## Executive summary", "", exec || "_No executive summary._", "", "## Gaps", "");

  if (!gaps.length) {
    lines.push("_No structured gap rows returned._", "");
  } else {
    gaps.forEach((g, i) => {
      const action = (g.recommendedAction ?? g.recommended_action ?? "").trim();
      lines.push(
        `### ${i + 1}. ${g.title}`,
        "",
        `**Severity:** ${g.severity}`,
        "",
        g.description,
        "",
        action ? `**Recommended action:** ${action}` : "",
        "",
      );
    });
  }

  lines.push("---", "_Demo output — verify against source PDFs and certification records._", "");
  return lines.join("\n");
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}
