/** CSV 1.1 — team-added sources persisted in the browser (POC). */

export type CustomSourceEntry = {
  id: string;
  region: string;
  country: string;
  jurisdiction: string;
  regulatoryBody: string;
  documentUrl: string;
};

const STORAGE_KEY = "gli.v1.customSources";

export const CUSTOM_SOURCES_CHANGED = "gli-custom-sources-changed";

type BrowserWindow = Window & typeof globalThis;

function browserWindow(): BrowserWindow | undefined {
  const g = globalThis as { window?: BrowserWindow };
  if (g.window?.localStorage) return g.window;
  if (typeof window !== "undefined" && window.localStorage) return window as BrowserWindow;
  return undefined;
}

export function notifyCustomSourcesChanged(): void {
  const w = browserWindow();
  if (!w) return;
  w.dispatchEvent(new CustomEvent(CUSTOM_SOURCES_CHANGED));
}

export function loadCustomSources(): CustomSourceEntry[] {
  const w = browserWindow();
  if (!w) return [];
  try {
    const raw = w.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: CustomSourceEntry[] = [];
    for (const row of arr) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = String(o.id ?? "").trim();
      const documentUrl = String(o.documentUrl ?? o.document_url ?? "").trim();
      if (!id || !documentUrl.startsWith("https://")) continue;
      out.push({
        id,
        region: String(o.region ?? "").trim() || "Custom",
        country: String(o.country ?? "").trim() || "—",
        jurisdiction: String(o.jurisdiction ?? "").trim() || "—",
        regulatoryBody: String(o.regulatoryBody ?? o.regulatory_body ?? "").trim() || "Custom source",
        documentUrl,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomSources(entries: CustomSourceEntry[]): void {
  const w = browserWindow();
  if (!w) return;
  w.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  notifyCustomSourcesChanged();
}

export function customSourceDocumentUrls(): string[] {
  const s = new Set<string>();
  for (const e of loadCustomSources()) {
    s.add(e.documentUrl);
  }
  return [...s].sort();
}

export function newCustomSourceId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `cs-${crypto.randomUUID()}`;
  return `cs-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
