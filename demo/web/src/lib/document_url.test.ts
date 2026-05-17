import { describe, expect, it } from "vitest";
import {
  DEMO_CANONICAL_PDF,
  DEMO_CANONICAL_PDF_REFS_HEADS,
  documentUrlsMatch,
  normalizeDocumentUrl,
} from "./document_url";

describe("document_url", () => {
  it("normalizes refs/heads/main to main", () => {
    expect(normalizeDocumentUrl(DEMO_CANONICAL_PDF_REFS_HEADS)).toBe(DEMO_CANONICAL_PDF);
  });

  it("documentUrlsMatch treats aliases as equal", () => {
    expect(documentUrlsMatch(DEMO_CANONICAL_PDF, DEMO_CANONICAL_PDF_REFS_HEADS)).toBe(true);
  });
});
