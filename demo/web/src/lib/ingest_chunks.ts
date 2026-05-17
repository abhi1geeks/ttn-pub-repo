/** Fetch indexed chunks from the web BFF for research prefill (2.3 / 2.4). */

import { expandDocumentUrlAliases, normalizeDocumentUrl } from "./document_url";

export type ChunkPoint = {
  payload?: {
    content?: string;
    metadata?: {
      chunkIndex?: number;
      jurisdiction?: string;
      documentUrl?: string;
    };
  };
};

export async function fetchDocumentChunks(documentUrl: string): Promise<ChunkPoint[]> {
  const candidates = expandDocumentUrlAliases(documentUrl);
  for (const url of candidates) {
    const r = await fetch(`/api/chunks?documentUrl=${encodeURIComponent(url)}`, { credentials: "same-origin" });
    const text = await r.text();
    if (!r.ok) continue;
    const data = JSON.parse(text) as { points?: ChunkPoint[] };
    const points = data.points ?? [];
    if (points.length > 0) return points;
  }
  return [];
}

function sortedByChunkIndex(points: ChunkPoint[]): ChunkPoint[] {
  return [...points].sort(
    (a, b) => (a.payload?.metadata?.chunkIndex ?? 0) - (b.payload?.metadata?.chunkIndex ?? 0),
  );
}

export function chunkExcerpt(point: ChunkPoint, maxChars = 900): string {
  const raw = String(point.payload?.content ?? "").trim();
  if (raw.length <= maxChars) return raw;
  return `${raw.slice(0, maxChars)}…`;
}

/** Join top chunks into regulatory-change text for gap analysis (2.4). */
export function chunksToRegulatoryText(points: ChunkPoint[], maxChunks = 6): string {
  const sorted = sortedByChunkIndex(points).slice(0, maxChunks);
  return sorted
    .map((p, i) => {
      const idx = p.payload?.metadata?.chunkIndex ?? i;
      return `[Chunk ${idx}]\n${chunkExcerpt(p, 1200)}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export type CrossSnippetDraft = { label: string; content: string; documentUrl: string };

/**
 * Build up to `maxUrls` cross-jurisdiction rows from ingested documents (one row per URL).
 */
export async function buildCrossRowsFromIngested(
  documentUrls: string[],
  options?: { maxUrls?: number; labelForUrl?: (url: string) => string },
): Promise<CrossSnippetDraft[]> {
  const maxUrls = options?.maxUrls ?? 3;
  const unique = [...new Set(documentUrls.map((u) => normalizeDocumentUrl(u)).filter(Boolean))].slice(0, maxUrls);
  const rows: CrossSnippetDraft[] = [];

  for (const url of unique) {
    const points = await fetchDocumentChunks(url);
    if (!points.length) continue;
    const sorted = sortedByChunkIndex(points);
    const content = sorted
      .slice(0, 2)
      .map((p) => chunkExcerpt(p, 700))
      .join("\n\n");
    if (content.length < 20) continue;
    const label = options?.labelForUrl?.(url) ?? `Ingested — ${url.split("/").pop() ?? url}`;
    rows.push({ label, content, documentUrl: url });
  }
  return rows;
}

/** When only one document is ingested, use two chunk excerpts as comparison rows (POC). */
export async function buildCrossRowsFromSingleDocument(documentUrl: string): Promise<CrossSnippetDraft[]> {
  const points = await fetchDocumentChunks(documentUrl);
  const sorted = sortedByChunkIndex(points);
  if (sorted.length < 2) return [];
  const a = sorted[0]!;
  const b = sorted[Math.min(1, sorted.length - 1)]!;
  return [
    {
      label: "Indexed excerpt A",
      content: chunkExcerpt(a, 700),
      documentUrl: normalizeDocumentUrl(documentUrl),
    },
    {
      label: "Indexed excerpt B",
      content: chunkExcerpt(b, 700),
      documentUrl: normalizeDocumentUrl(documentUrl),
    },
  ];
}
