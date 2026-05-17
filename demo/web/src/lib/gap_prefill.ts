/** Hand off ingest diff text from monitor → hub gap analysis (CSV 2.4). */

const STORAGE_KEY = "gli_gap_prefill_reg_text";

export function saveGapPrefillRegulatoryText(text: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, text);
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadGapPrefillRegulatoryText(): string | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY)?.trim();
    return v ? v : null;
  } catch {
    return null;
  }
}

export function clearGapPrefillRegulatoryText(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
