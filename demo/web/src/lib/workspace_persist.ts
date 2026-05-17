/** Persist ingest monitor UI choices across refresh (session only). */

const KEY_URL = "gli.v1.selectedDocumentUrl";
const KEY_SURFACE = "gli.v1.appSurface";

export type AppSurface = "gli_hub" | "ingest_workspace";

export function loadPersistedDocumentUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(KEY_URL);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

export function savePersistedDocumentUrl(url: string): void {
  if (typeof window === "undefined" || !url.trim()) return;
  try {
    window.sessionStorage.setItem(KEY_URL, url.trim());
  } catch {
    /* ignore */
  }
}

export function loadPersistedAppSurface(): AppSurface | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.sessionStorage.getItem(KEY_SURFACE);
    if (v === "gli_hub" || v === "ingest_workspace") return v;
    return null;
  } catch {
    return null;
  }
}

export function savePersistedAppSurface(surface: AppSurface): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY_SURFACE, surface);
  } catch {
    /* ignore */
  }
}
