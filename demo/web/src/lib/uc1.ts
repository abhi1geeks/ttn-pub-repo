/** Session key for POC HITL acknowledgment (no backend). */
export function hitlStorageKey(documentUrl: string, runKey: string): string {
  return `uc1.hitl.v1:${documentUrl}::${runKey}`;
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
