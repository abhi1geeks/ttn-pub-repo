import { describe, expect, it } from "vitest";
import { CATALOG_DOCUMENT_URLS, SOURCES_CATALOG, countCatalogLeaves, flattenSourcesCatalog } from "./sources_catalog";

describe("sources_catalog", () => {
  it("flatten includes region, country, jurisdiction", () => {
    const flat = flattenSourcesCatalog(SOURCES_CATALOG);
    const nv = flat.find((r) => r.id === "nv-ngcb-tech-stand");
    expect(nv?.region).toBe("Americas");
    expect(nv?.country).toBe("United States");
    expect(nv?.jurisdiction).toBe("Nevada");
  });

  it("countCatalogLeaves matches flatten length", () => {
    expect(countCatalogLeaves(SOURCES_CATALOG)).toBe(flattenSourcesCatalog(SOURCES_CATALOG).length);
  });

  it("CATALOG_DOCUMENT_URLS is deduped sorted list", () => {
    expect(CATALOG_DOCUMENT_URLS.length).toBeGreaterThan(0);
    const sorted = [...CATALOG_DOCUMENT_URLS].sort();
    expect(CATALOG_DOCUMENT_URLS).toEqual(sorted);
    expect(new Set(CATALOG_DOCUMENT_URLS).size).toBe(CATALOG_DOCUMENT_URLS.length);
  });
});
