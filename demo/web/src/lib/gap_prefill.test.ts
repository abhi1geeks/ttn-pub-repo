import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGapPrefillRegulatoryText,
  loadGapPrefillRegulatoryText,
  saveGapPrefillRegulatoryText,
} from "./gap_prefill";

describe("gap_prefill", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
    clearGapPrefillRegulatoryText();
  });

  it("round-trips regulatory text in sessionStorage", () => {
    saveGapPrefillRegulatoryText("  delta text  ");
    expect(loadGapPrefillRegulatoryText()).toBe("delta text");
    clearGapPrefillRegulatoryText();
    expect(loadGapPrefillRegulatoryText()).toBeNull();
  });
});
