/** Hand off ingest monitor → hub cross-jurisdiction compare (CSV 2.3). */

const STORAGE_KEY = "gli_cross_prefill_auto";

export function requestCrossPrefillFromIngest(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeCrossPrefillFromIngest(): boolean {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    return v === "1";
  } catch {
    return false;
  }
}
