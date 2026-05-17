/** CSV export for version history table (CSV 1.4). */

import { parseHitlReview } from "./uc1";

export type VersionHistoryRun = {
  timestamp?: string;
  versionId?: string;
  documentHash?: string;
  runPointId?: string;
  summary?: {
    totalChunks?: number;
    newChunks?: number;
    removedChunks?: number;
  };
  hitlReview?: unknown;
};

function csvEscape(s: string): string {
  const t = s.replace(/"/g, '""');
  return /[",\n\r]/.test(t) ? `"${t}"` : t;
}

export function buildVersionHistoryCsv(documentUrl: string, runs: VersionHistoryRun[]): string {
  const header = [
    "document_url",
    "ingest_timestamp",
    "version_id",
    "document_hash",
    "run_point_id",
    "new_chunks",
    "removed_chunks",
    "total_chunks",
    "hitl_status",
  ];
  const rows = runs.map((r) => {
    const s = r.summary ?? {};
    const hitl = parseHitlReview(r.hitlReview);
    return [
      documentUrl,
      String(r.timestamp ?? ""),
      String(r.versionId ?? ""),
      String(r.documentHash ?? ""),
      String(r.runPointId ?? ""),
      String(s.newChunks ?? ""),
      String(s.removedChunks ?? ""),
      String(s.totalChunks ?? ""),
      hitl?.status ?? "",
    ].map(csvEscape);
  });
  return [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
