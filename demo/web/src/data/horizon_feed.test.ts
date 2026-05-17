import { describe, expect, it } from "vitest";
import { HORIZON_FEED } from "./horizon_feed";
import { ENFORCEMENT_FEED } from "./enforcement_feed";
import { DEMO_CANONICAL_PDF } from "../lib/document_url";

describe("feed monitor links", () => {
  it("horizon items link to POC ingest URL", () => {
    expect(HORIZON_FEED.length).toBeGreaterThan(0);
    for (const h of HORIZON_FEED) {
      expect(h.monitorDocumentUrl).toBe(DEMO_CANONICAL_PDF);
    }
  });

  it("enforcement items link to POC ingest URL", () => {
    for (const e of ENFORCEMENT_FEED) {
      expect(e.monitorDocumentUrl).toBe(DEMO_CANONICAL_PDF);
    }
  });
});
