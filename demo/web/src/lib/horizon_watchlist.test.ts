import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadHorizonWatchlist,
  saveHorizonWatchlist,
  toggleHorizonWatch,
} from "./horizon_watchlist";

describe("horizon_watchlist", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    saveHorizonWatchlist([]);
  });

  it("toggle adds and removes ids", () => {
    const afterAdd = toggleHorizonWatch("hz-001");
    expect(afterAdd).toContain("hz-001");
    const afterRemove = toggleHorizonWatch("hz-001");
    expect(afterRemove).not.toContain("hz-001");
    expect(loadHorizonWatchlist()).toEqual([]);
  });
});
