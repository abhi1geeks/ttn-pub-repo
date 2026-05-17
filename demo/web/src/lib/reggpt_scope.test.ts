import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyDocumentScope, reggptScopeMeta } from "./reggpt_scope";
import { CATALOG_DOCUMENT_URLS } from "../data/sources_catalog";
import * as customSources from "./custom_sources";

describe("reggpt_scope", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies catalogue URLs", () => {
    const url = CATALOG_DOCUMENT_URLS[0]!;
    expect(classifyDocumentScope(url)).toBe("catalog");
    expect(reggptScopeMeta(url).label).toContain("Curated");
  });

  it("classifies custom sources", () => {
    const url = "https://example.com/custom-reg.pdf";
    vi.spyOn(customSources, "customSourceDocumentUrls").mockReturnValue([url]);
    expect(classifyDocumentScope(url)).toBe("custom");
  });

  it("classifies unknown URLs as adhoc", () => {
    expect(classifyDocumentScope("https://unknown.example/doc.pdf")).toBe("adhoc");
  });
});
