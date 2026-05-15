/** Max length for optional HITL note stored on the run payload (Qdrant). */
export const HITL_REASON_MAX_LEN = 2000;

/** Session key for POC HITL fallback when `runPointId` is missing (legacy / dev). */
export function hitlStorageKey(documentUrl: string, runKey: string): string {
  return `uc1.hitl.v1:${documentUrl}::${runKey}`;
}

export function clampHitlReason(raw: string): string {
  return String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, HITL_REASON_MAX_LEN);
}

/** Payload written by POST /api/runs/review (Phase 1). */
export type HitlReviewPayload = {
  status: "acknowledged" | "flagged";
  reason?: string;
  reviewedAt?: string;
  source?: string;
};

export function parseHitlReview(raw: unknown): HitlReviewPayload | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.status !== "acknowledged" && o.status !== "flagged") return undefined;
  const out: HitlReviewPayload = { status: o.status };
  if (typeof o.reason === "string" && o.reason.trim()) out.reason = o.reason.trim();
  if (typeof o.reviewedAt === "string" && o.reviewedAt) out.reviewedAt = o.reviewedAt;
  if (typeof o.source === "string" && o.source) out.source = o.source;
  return out;
}

export function shortHash(value: string | undefined, head = 12): string {
  if (!value) return "—";
  const v = String(value);
  return v.length <= head ? v : `${v.slice(0, head)}…`;
}

export type RunSummary = {
  totalChunks?: number;
  newChunks?: number;
  removedChunks?: number;
  unchangedChunks?: number;
};
