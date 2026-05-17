/** CSV 1.1 — catalogue ingest coverage vs Qdrant runs (POC). */

import type { FlatSourceEntry } from "../data/sources_catalog";
import type { CustomSourceEntry } from "./custom_sources";
import { documentUrlsMatch } from "./document_url";

export type RegionCoverage = {
  region: string;
  total: number;
  ingested: number;
};

export type SourceCoverageReport = {
  total: number;
  ingested: number;
  percentIngested: number;
  regions: RegionCoverage[];
  customTotal: number;
  customIngested: number;
};

export function customSourcesToFlat(entries: CustomSourceEntry[]): FlatSourceEntry[] {
  return entries.map((c) => ({
    id: c.id,
    regulatoryBody: c.regulatoryBody,
    documentUrl: c.documentUrl,
    region: c.region || "Custom",
    country: c.country,
    jurisdiction: c.jurisdiction,
  }));
}

export function isUrlIngested(documentUrl: string, ingestedUrls: string[]): boolean {
  return ingestedUrls.some((u) => documentUrlsMatch(u, documentUrl));
}

export function buildSourceCoverage(
  catalogLeaves: FlatSourceEntry[],
  ingestedUrls: string[],
  customSources: CustomSourceEntry[] = [],
): SourceCoverageReport {
  const byRegion = new Map<string, { total: number; ingested: number }>();
  let ingested = 0;
  let customIngested = 0;

  for (const c of customSources) {
    if (isUrlIngested(c.documentUrl, ingestedUrls)) customIngested += 1;
  }

  for (const leaf of catalogLeaves) {
    const hit = isUrlIngested(leaf.documentUrl, ingestedUrls);
    if (hit) ingested += 1;
    const row = byRegion.get(leaf.region) ?? { total: 0, ingested: 0 };
    row.total += 1;
    if (hit) row.ingested += 1;
    byRegion.set(leaf.region, row);
  }

  const total = catalogLeaves.length;
  const regions: RegionCoverage[] = [...byRegion.entries()]
    .map(([region, v]) => ({ region, total: v.total, ingested: v.ingested }))
    .sort((a, b) => a.region.localeCompare(b.region));

  return {
    total,
    ingested,
    percentIngested: total > 0 ? Math.round((ingested / total) * 100) : 0,
    regions,
    customTotal: customSources.length,
    customIngested,
  };
}
