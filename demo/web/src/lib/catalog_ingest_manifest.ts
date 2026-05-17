/** CSV 1.1 — list catalogue URLs suitable for n8n ingest (excludes demo placeholders). */

import { flattenSourcesCatalog, SOURCES_CATALOG, type FlatSourceEntry } from "../data/sources_catalog";
import type { CustomSourceEntry } from "./custom_sources";

const PLACEHOLDER_HOST = "demo.gli-intelligence.example";

export function isIngestibleCatalogUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host !== PLACEHOLDER_HOST && url.startsWith("https://");
  } catch {
    return false;
  }
}

export function listIngestibleCatalogUrls(catalogLeaves?: FlatSourceEntry[]): string[] {
  const leaves = catalogLeaves ?? flattenSourcesCatalog(SOURCES_CATALOG);
  const out = new Set<string>();
  for (const leaf of leaves) {
    if (isIngestibleCatalogUrl(leaf.documentUrl)) out.add(leaf.documentUrl);
  }
  return [...out].sort();
}

export function buildIngestManifestText(
  catalogUrls: string[],
  customSources: CustomSourceEntry[],
): string {
  const lines: string[] = [
    "# GLI Intelligence — ingest manifest (POC)",
    `# Generated: ${new Date().toISOString()}`,
    "",
    "## Catalogue URLs (non-placeholder)",
    ...catalogUrls.map((u) => `- ${u}`),
    "",
    "## Team custom sources",
    ...(customSources.length
      ? customSources.map((c) => `- ${c.documentUrl}  (${c.jurisdiction} · ${c.regulatoryBody})`)
      : ["- (none)"]),
    "",
    "## n8n note",
    "Set documentUrl in Set Config to each URL above and run the ingest workflow.",
    "POC PDF used in this repo:",
    "https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/regulation-14-as-of-02-26.pdf",
  ];
  return lines.join("\n");
}
