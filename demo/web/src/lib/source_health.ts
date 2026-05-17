/** XC-004 — per-document ingest health from latest run payload. */

import { fmtTs } from "./format";
import { INGEST_WORKFLOW_PHRASE } from "./product_labels";

export type SourceHealthSummary = {
  status: "ok" | "error" | "unknown";
  label: string;
  detail: string;
};

type SourceIngest = {
  httpStatus?: number | null;
  fetchedAt?: string | null;
  error?: string | null;
};

type RunLike = {
  timestamp?: string;
  sourceIngest?: SourceIngest;
};

export function buildSourceHealthFromRuns(runs: RunLike[]): SourceHealthSummary {
  if (!runs.length) {
    return {
      status: "unknown",
      label: "No ingest runs",
      detail: `Run the ${INGEST_WORKFLOW_PHRASE} for this document URL.`,
    };
  }
  const sorted = [...runs].sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));
  const latest = sorted[0]!;
  const si = latest.sourceIngest;
  const ts = latest.timestamp ? fmtTs(String(latest.timestamp)) : "unknown time";
  if (si?.error) {
    return {
      status: "error",
      label: "Last ingest failed",
      detail: `${ts} — ${String(si.error).slice(0, 120)}`,
    };
  }
  const http = si?.httpStatus;
  if (http != null && http >= 400) {
    return {
      status: "error",
      label: `HTTP ${http}`,
      detail: `Last fetch ${ts}${si?.fetchedAt ? ` · fetched ${fmtTs(si.fetchedAt)}` : ""}`,
    };
  }
  return {
    status: "ok",
    label: "Last ingest OK",
    detail: `${ts}${http != null ? ` · HTTP ${http}` : ""}${si?.fetchedAt ? ` · fetched ${fmtTs(si.fetchedAt)}` : ""}`,
  };
}
