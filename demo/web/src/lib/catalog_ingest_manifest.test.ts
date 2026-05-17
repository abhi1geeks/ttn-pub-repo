import { describe, expect, it } from "vitest";
import { flattenSourcesCatalog, SOURCES_CATALOG } from "../data/sources_catalog";
import { DEMO_CANONICAL_PDF } from "./document_url";
import { isIngestibleCatalogUrl, listIngestibleCatalogUrls } from "./catalog_ingest_manifest";

describe("catalog_ingest_manifest", () => {
  it("excludes placeholder host", () => {
    expect(isIngestibleCatalogUrl("https://demo.gli-intelligence.example/foo.pdf")).toBe(false);
    expect(isIngestibleCatalogUrl(DEMO_CANONICAL_PDF)).toBe(true);
  });

  it("lists at least the POC PDF", () => {
    const urls = listIngestibleCatalogUrls(flattenSourcesCatalog(SOURCES_CATALOG));
    expect(urls).toContain(DEMO_CANONICAL_PDF);
  });
});
