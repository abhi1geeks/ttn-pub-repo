/** Scroll target when hub sidebar links to ingest-monitor features (1.2–2.2). */

const STORAGE_KEY = "gli_ingest_feature_focus";

export type IngestFeatureFocusId = "1.2" | "1.3" | "1.4" | "2.1" | "2.2";

export const INGEST_FEATURE_SECTION_ID: Record<IngestFeatureFocusId, string> = {
  "1.2": "gli-ingest-change",
  "1.3": "gli-ingest-alert",
  "1.4": "gli-ingest-version",
  "2.1": "gli-ingest-impact",
  "2.2": "gli-ingest-reggpt",
};

export const INGEST_FEATURE_IDS = new Set<string>(Object.keys(INGEST_FEATURE_SECTION_ID));

export function saveIngestFeatureFocus(id: IngestFeatureFocusId): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function loadIngestFeatureFocus(): IngestFeatureFocusId | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    if (v && INGEST_FEATURE_IDS.has(v)) return v as IngestFeatureFocusId;
  } catch {
    /* ignore */
  }
  return null;
}

export function clearIngestFeatureFocus(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
