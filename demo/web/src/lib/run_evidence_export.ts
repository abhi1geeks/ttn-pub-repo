import type { HitlReviewPayload } from "./uc1";
import { parseHitlReview, type RunSummary } from "./uc1";

export type EvidenceRunSlice = {
  timestamp?: string;
  versionId?: string;
  documentHash?: string;
  runPointId?: string;
  summary?: RunSummary;
  sourceIngest?: Record<string, unknown>;
  materialityScore?: number;
  materialityNotes?: string;
  llmSummary?: string;
  hitlReview?: HitlReviewPayload;
  /** When true, include first/last excerpt of fullText instead of omitting. */
  fullText?: string;
};

export type RunEvidenceExport = {
  schema: "gli.run-evidence.v1";
  exportedAt: string;
  documentUrl: string;
  note: string;
  baseline?: EvidenceRunSlice;
  current?: EvidenceRunSlice;
  /** Optional UI-only impact fields (may differ from stored run until merge). */
  impactDisplay?: {
    executiveSummary?: string;
    materialityNotes?: string;
    materialityScore?: number | null;
    agentsModelId?: string;
    stub?: boolean;
  };
};

const DEFAULT_NOTE =
  "POC export: hashes, ingest metadata, HITL, and summaries. fullText omitted by default to keep JSON small.";

function trimText(s: string | undefined, max: number): string | undefined {
  if (s == null) return undefined;
  const t = String(s).trim();
  if (!t) return undefined;
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function sliceRun(
  r: EvidenceRunSlice | undefined,
  opts: { includeFullTextHeadTail: boolean },
): EvidenceRunSlice | undefined {
  if (!r) return undefined;
  const { fullText, ...rest } = r;
  const out: EvidenceRunSlice = { ...rest };
  if (opts.includeFullTextHeadTail && fullText && fullText.length > 0) {
    const head = fullText.slice(0, 1200);
    const tail = fullText.length > 2400 ? fullText.slice(-1200) : "";
    out.fullText =
      tail && fullText.length > 2400 ? `${head}\n\n…[middle omitted]…\n\n${tail}` : head;
  }
  return out;
}

export function runToEvidenceSlice(r: {
  timestamp?: string;
  versionId?: string;
  documentHash?: string;
  runPointId?: string;
  summary?: RunSummary;
  sourceIngest?: unknown;
  materialityScore?: number;
  materialityNotes?: string;
  llmSummary?: string;
  hitlReview?: unknown;
}): EvidenceRunSlice {
  const si =
    r.sourceIngest && typeof r.sourceIngest === "object"
      ? (r.sourceIngest as Record<string, unknown>)
      : undefined;
  const hitl = parseHitlReview(r.hitlReview);
  return {
    timestamp: r.timestamp,
    versionId: r.versionId,
    documentHash: r.documentHash,
    runPointId: r.runPointId,
    summary: r.summary,
    sourceIngest: si,
    materialityScore: r.materialityScore,
    materialityNotes: trimText(r.materialityNotes, 8000),
    llmSummary: trimText(r.llmSummary, 8000),
    hitlReview: hitl,
  };
}

export function buildRunEvidenceExport(input: {
  documentUrl: string;
  baseline?: EvidenceRunSlice;
  current?: EvidenceRunSlice;
  impactDisplay?: RunEvidenceExport["impactDisplay"];
  includeFullTextHeadTail?: boolean;
}): RunEvidenceExport {
  const include = Boolean(input.includeFullTextHeadTail);
  return {
    schema: "gli.run-evidence.v1",
    exportedAt: new Date().toISOString(),
    documentUrl: input.documentUrl,
    note: include ? DEFAULT_NOTE.replace("omitted", "head+tail excerpt included") : DEFAULT_NOTE,
    baseline: sliceRun(input.baseline, { includeFullTextHeadTail: include }),
    current: sliceRun(input.current, { includeFullTextHeadTail: include }),
    impactDisplay: input.impactDisplay,
  };
}

export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}
