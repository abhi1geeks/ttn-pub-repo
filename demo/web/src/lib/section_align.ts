export type AlignedChangeKind = "inserted" | "deleted" | "modified" | "moved";

export type AlignedChange = {
  kind: AlignedChangeKind;
  similarity: number;
  baselinePage: number | null;
  currentPage: number | null;
  baselineBlockId?: string | null;
  currentBlockId?: string | null;
  baselineExcerpt?: string;
  currentExcerpt?: string;
};

export type AlignedChangesSummary = {
  inserted: number;
  deleted: number;
  modified: number;
  moved: number;
};

export type AlignedKindFilter = {
  inserted: boolean;
  deleted: boolean;
  modified: boolean;
  moved: boolean;
};

export const DEFAULT_ALIGNED_KIND_FILTER: AlignedKindFilter = {
  inserted: true,
  deleted: true,
  modified: true,
  moved: true,
};

export function alignedChangesUrl(
  documentUrl: string,
  baselineVersionId: string,
  currentVersionId: string,
): string {
  const p = new URLSearchParams({ documentUrl, baselineVersionId, currentVersionId });
  return `/api/runs/aligned-changes?${p.toString()}`;
}

export function filterAlignedByKind(changes: AlignedChange[], filter: AlignedKindFilter): AlignedChange[] {
  return changes.filter((c) => filter[c.kind]);
}

export function kindLabel(kind: AlignedChangeKind): string {
  if (kind === "moved") return "Moved";
  if (kind === "modified") return "Modified";
  if (kind === "deleted") return "Deleted";
  return "Inserted";
}

export function kindBadgeClass(kind: AlignedChangeKind): string {
  if (kind === "moved") return "border-violet-200 bg-violet-50 text-violet-900";
  if (kind === "modified") return "border-amber-200 bg-amber-50 text-amber-950";
  if (kind === "deleted") return "border-red-200 bg-red-50 text-red-900";
  return "border-green-200 bg-green-50 text-green-900";
}

export function pageRefLabel(ch: AlignedChange): string {
  if (ch.kind === "moved") {
    return `p.${ch.baselinePage ?? "?"} → p.${ch.currentPage ?? "?"}`;
  }
  if (ch.kind === "deleted") return `baseline p.${ch.baselinePage ?? "?"}`;
  if (ch.kind === "inserted") return `current p.${ch.currentPage ?? "?"}`;
  const p = ch.baselinePage ?? ch.currentPage;
  return p != null ? `p.${p}` : "";
}
