import { describe, expect, it, beforeEach } from "vitest";
import {
  CUSTOM_SOURCES_CHANGED,
  customSourceDocumentUrls,
  loadCustomSources,
  newCustomSourceId,
  saveCustomSources,
  type CustomSourceEntry,
} from "./custom_sources";

function installWindowAndStorage(): void {
  const storage: Record<string, string> = {};
  const listeners = new Map<string, Set<(ev: Event) => void>>();

  const ls: Storage = {
    get length() {
      return Object.keys(storage).length;
    },
    clear() {
      for (const k of Object.keys(storage)) delete storage[k];
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key]! : null;
    },
    key(index: number) {
      const keys = Object.keys(storage);
      return keys[index] ?? null;
    },
    removeItem(key: string) {
      delete storage[key];
    },
    setItem(key: string, value: string) {
      storage[key] = value;
    },
  };

  const win = {
    localStorage: ls,
    dispatchEvent(ev: Event): boolean {
      for (const fn of listeners.get(ev.type) ?? []) fn(ev);
      return true;
    },
    addEventListener(type: string, fn: EventListener): void {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(fn as (ev: Event) => void);
    },
    removeEventListener(type: string, fn: EventListener): void {
      const set = listeners.get(type);
      if (!set) return;
      set.delete(fn as (ev: Event) => void);
    },
  };

  (globalThis as unknown as { window: typeof win }).window = win;
}

describe("custom_sources", () => {
  beforeEach(() => {
    installWindowAndStorage();
    window.localStorage.clear();
  });

  it("roundtrips entries and lists URLs", () => {
    const entries: CustomSourceEntry[] = [
      {
        id: "a1",
        region: "EU",
        country: "DE",
        jurisdiction: "DE",
        regulatoryBody: "Test body",
        documentUrl: "https://example.com/a.pdf",
      },
    ];
    saveCustomSources(entries);
    expect(loadCustomSources()).toHaveLength(1);
    expect(customSourceDocumentUrls()).toEqual(["https://example.com/a.pdf"]);
  });

  it("newCustomSourceId is non-empty", () => {
    expect(newCustomSourceId().length).toBeGreaterThan(4);
  });

  it("dispatches change event on save", () => {
    let n = 0;
    const h = () => {
      n += 1;
    };
    window.addEventListener(CUSTOM_SOURCES_CHANGED, h);
    saveCustomSources([]);
    window.removeEventListener(CUSTOM_SOURCES_CHANGED, h);
    expect(n).toBe(1);
  });
});
