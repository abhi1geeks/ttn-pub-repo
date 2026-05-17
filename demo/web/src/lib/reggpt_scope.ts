/** CSV 2.2 — RegGPT scope: curated library vs team-added vs ad-hoc URL. */

import { CATALOG_DOCUMENT_URLS } from "../data/sources_catalog";
import { customSourceDocumentUrls } from "./custom_sources";

export type ReggptScopeKind = "catalog" | "custom" | "adhoc";

export type ReggptScopeMeta = {
  kind: ReggptScopeKind;
  label: string;
  description: string;
};

const SCOPE_COPY: Record<ReggptScopeKind, Omit<ReggptScopeMeta, "kind">> = {
  catalog: {
    label: "Curated library (1.1)",
    description:
      "This canonical URL is in the demo source catalogue. RegGPT retrieves only from Qdrant chunks indexed for this URL.",
  },
  custom: {
    label: "Team-added source (1.1)",
    description:
      "URL added in the hub custom-sources panel (browser localStorage). Ingest via n8n to index chunks before Q&A.",
  },
  adhoc: {
    label: "Ad-hoc scope",
    description:
      "URL is not in the catalogue or custom library. Q&A still works if you have ingested runs; otherwise ingest first.",
  },
};

export function classifyDocumentScope(documentUrl: string): ReggptScopeKind {
  const u = documentUrl.trim();
  if (!u) return "adhoc";
  if (CATALOG_DOCUMENT_URLS.includes(u)) return "catalog";
  if (customSourceDocumentUrls().includes(u)) return "custom";
  return "adhoc";
}

export function reggptScopeMeta(documentUrl: string): ReggptScopeMeta {
  const kind = classifyDocumentScope(documentUrl);
  return { kind, ...SCOPE_COPY[kind] };
}

/** Short label for UI chrome (welcome, dock header). */
export function reggptScopeShortLabel(kind: ReggptScopeKind): string {
  switch (kind) {
    case "catalog":
      return "Library document";
    case "custom":
      return "Custom source";
    default:
      return "Scoped URL";
  }
}

export function reggptScopeBadgeClass(kind: ReggptScopeKind): string {
  switch (kind) {
    case "catalog":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
    case "custom":
      return "bg-amber-100 text-amber-900 ring-amber-200/80";
    default:
      return "bg-zinc-200 text-zinc-800 ring-zinc-300/80";
  }
}
