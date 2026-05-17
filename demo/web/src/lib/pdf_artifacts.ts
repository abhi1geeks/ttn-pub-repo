export type PdfArtifact = {
  path: string;
  sha256?: string;
  bytes?: number;
  urlHash?: string;
};

export type LayoutArtifact = {
  path: string;
  pageCount?: number;
};

export type ChangeRegion = {
  page: number;
  kind: "insert" | "delete" | "replace";
  bbox: [number, number, number, number];
  excerpt?: string;
};

export type RegionKindFilter = {
  delete: boolean;
  insert: boolean;
  replace: boolean;
};

export const DEFAULT_REGION_KIND_FILTER: RegionKindFilter = {
  delete: true,
  insert: true,
  replace: true,
};

export type PageLayout = {
  pageNumber: number;
  width: number;
  height: number;
  text?: string;
  spans: { text: string; bbox: [number, number, number, number]; charStart?: number }[];
};

export type LayoutDocument = {
  pages: PageLayout[];
  pageCount?: number;
};

/** ISO A4 page size in PDF points (72 pt/in). */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

export function clampPdfScale(scale: number, min = 0.45, max = 2.5): number {
  return Math.min(max, Math.max(min, scale));
}

/** Default comparison zoom: fit page width (A4 or layout width) inside one pane. */
export function scaleToFitPaneWidth(
  paneWidthPx: number,
  pageWidthPt: number,
  paddingPx = 12,
): number {
  if (paneWidthPx <= 0 || pageWidthPt <= 0) return 1;
  const available = Math.max(paneWidthPx - paddingPx, 120);
  return clampPdfScale(available / pageWidthPt);
}

export function pdfUrlForRun(documentUrl: string, versionId: string): string {
  const p = new URLSearchParams({ documentUrl, versionId });
  return `/api/runs/pdf?${p.toString()}`;
}

export function layoutUrlForRun(documentUrl: string, versionId: string): string {
  const p = new URLSearchParams({ documentUrl, versionId });
  return `/api/runs/layout?${p.toString()}`;
}

export function diffRegionsUrl(
  documentUrl: string,
  baselineVersionId: string,
  currentVersionId: string,
): string {
  const p = new URLSearchParams({ documentUrl, baselineVersionId, currentVersionId });
  return `/api/runs/diff-regions?${p.toString()}`;
}

/** Map PyMuPDF bbox (top-left origin) to canvas/SVG pixels; clip to page bounds. */
export function bboxToViewport(
  bbox: [number, number, number, number],
  pageWidth: number,
  pageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): { x: number; y: number; w: number; h: number } | null {
  const [rawX0, rawY0, rawX1, rawY1] = bbox;
  const pw = pageWidth > 0 ? pageWidth : 612;
  const ph = pageHeight > 0 ? pageHeight : 792;
  const x0 = Math.max(0, Math.min(rawX0, pw));
  const y0 = Math.max(0, Math.min(rawY0, ph));
  const x1 = Math.max(x0, Math.min(rawX1, pw));
  const y1 = Math.max(y0, Math.min(rawY1, ph));
  if (x1 <= x0 || y1 <= y0) return null;
  const sx = viewportWidth / pw;
  const sy = viewportHeight / ph;
  let x = x0 * sx;
  let y = y0 * sy;
  let w = (x1 - x0) * sx;
  let h = (y1 - y0) * sy;
  x = Math.max(0, Math.min(x, viewportWidth - 1));
  y = Math.max(0, Math.min(y, viewportHeight - 1));
  w = Math.max(2, Math.min(w, viewportWidth - x));
  h = Math.max(2, Math.min(h, viewportHeight - y));
  return { x, y, w, h };
}

export function regionFill(kind: ChangeRegion["kind"]): string {
  if (kind === "delete") return "rgba(239, 68, 68, 0.4)";
  if (kind === "insert") return "rgba(34, 197, 94, 0.4)";
  return "rgba(234, 179, 8, 0.45)";
}

export function regionStroke(kind: ChangeRegion["kind"]): string {
  if (kind === "delete") return "#b91c1c";
  if (kind === "insert") return "#15803d";
  return "#a16207";
}

export function filterRegionsByKind(regions: ChangeRegion[], filter: RegionKindFilter): ChangeRegion[] {
  return regions.filter((r) => {
    if (r.kind === "delete") return filter.delete;
    if (r.kind === "insert") return filter.insert;
    return filter.replace;
  });
}

/** Baseline pane: deletions and replacements; current pane: insertions and replacements. */
export function regionsForPdfSide(
  regions: ChangeRegion[],
  side: "baseline" | "current",
): ChangeRegion[] {
  return regions.filter((r) =>
    side === "baseline" ? r.kind === "delete" || r.kind === "replace" : r.kind === "insert" || r.kind === "replace",
  );
}
