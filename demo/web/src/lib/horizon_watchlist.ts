/** CSV 1.5 — browser-persisted horizon early-warning watchlist (demo). */

const STORAGE_KEY = "gli.v1.horizonWatchlist";

export const HORIZON_WATCHLIST_CHANGED = "gli-horizon-watchlist-changed";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function notifyHorizonWatchlistChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HORIZON_WATCHLIST_CHANGED));
}

export function loadHorizonWatchlist(): string[] {
  const ls = storage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x)).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveHorizonWatchlist(ids: string[]): void {
  const ls = storage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
    notifyHorizonWatchlistChanged();
  } catch {
    /* ignore */
  }
}

export function toggleHorizonWatch(id: string): string[] {
  const cur = new Set(loadHorizonWatchlist());
  if (cur.has(id)) cur.delete(id);
  else cur.add(id);
  const next = [...cur];
  saveHorizonWatchlist(next);
  return next;
}

export function isHorizonWatched(id: string, list?: string[]): boolean {
  const ids = list ?? loadHorizonWatchlist();
  return ids.includes(id);
}
