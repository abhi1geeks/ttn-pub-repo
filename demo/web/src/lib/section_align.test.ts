import { describe, expect, it } from "vitest";
import {
  alignedChangesUrl,
  filterAlignedByKind,
  kindLabel,
  pageRefLabel,
  DEFAULT_ALIGNED_KIND_FILTER,
  type AlignedChange,
} from "./section_align";

describe("section_align", () => {
  it("builds aligned-changes API URL", () => {
    const u = alignedChangesUrl("https://example.com/doc.pdf", "v1", "v2");
    expect(u).toContain("/api/runs/aligned-changes?");
    expect(u).toContain("documentUrl=");
    expect(u).toContain("baselineVersionId=v1");
    expect(u).toContain("currentVersionId=v2");
  });

  it("filters by kind", () => {
    const changes: AlignedChange[] = [
      { kind: "moved", similarity: 0.9, baselinePage: 1, currentPage: 2 },
      { kind: "deleted", similarity: 0, baselinePage: 3, currentPage: null },
    ];
    const filtered = filterAlignedByKind(changes, { ...DEFAULT_ALIGNED_KIND_FILTER, deleted: false });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("moved");
  });

  it("labels moved page refs", () => {
    const ch: AlignedChange = {
      kind: "moved",
      similarity: 0.85,
      baselinePage: 5,
      currentPage: 12,
    };
    expect(kindLabel(ch.kind)).toBe("Moved");
    expect(pageRefLabel(ch)).toBe("p.5 → p.12");
  });
});
