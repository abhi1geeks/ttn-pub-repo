/** URL ↔ workspace state (shareable links, back/forward). */

import type { AppSurface } from "./workspace_persist";
import type { IngestFeatureFocusId } from "./ingest_feature_focus";
import { INGEST_FEATURE_IDS } from "./ingest_feature_focus";

export type IngestTabId = "doc" | "chunks" | "now";

export type AppRouteState = {
  surface: AppSurface;
  documentUrl: string;
  tab: IngestTabId;
  focus: IngestFeatureFocusId | null;
};

const DEFAULT: AppRouteState = {
  surface: "gli_hub",
  documentUrl: "",
  tab: "doc",
  focus: null,
};

function parseTab(raw: string | null): IngestTabId {
  if (raw === "chunks" || raw === "now" || raw === "doc") return raw;
  return "doc";
}

function parseFocus(raw: string | null): IngestFeatureFocusId | null {
  if (raw && INGEST_FEATURE_IDS.has(raw)) return raw as IngestFeatureFocusId;
  return null;
}

export function readAppRouteFromLocation(): AppRouteState {
  if (typeof window === "undefined") return { ...DEFAULT };
  const p = new URLSearchParams(window.location.search);
  const surfaceRaw = p.get("surface");
  const surface: AppSurface = surfaceRaw === "ingest" ? "ingest_workspace" : "gli_hub";
  return {
    surface,
    documentUrl: p.get("doc")?.trim() ?? "",
    tab: parseTab(p.get("tab")),
    focus: parseFocus(p.get("focus")),
  };
}

export function writeAppRouteToLocation(state: AppRouteState, replace = false): void {
  if (typeof window === "undefined") return;
  const p = new URLSearchParams();
  if (state.surface === "ingest_workspace") {
    p.set("surface", "ingest");
    if (state.documentUrl.trim()) p.set("doc", state.documentUrl.trim());
    if (state.tab !== "doc") p.set("tab", state.tab);
    if (state.focus) p.set("focus", state.focus);
  } else {
    p.set("surface", "hub");
  }
  const qs = p.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  if (replace) window.history.replaceState(null, "", next);
  else window.history.pushState(null, "", next);
}

export function subscribeAppRoute(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}
