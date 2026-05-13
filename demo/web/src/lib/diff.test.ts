import { describe, expect, it } from "vitest";
import {
  buildPageWiseLineDiff,
  buildSideBySideLineRows,
  buildSideBySideRows,
  buildUnifiedDiffLines,
  classifyUnifiedLineCategories,
  filterSideBySideRows,
  filterUnifiedDiffLines,
  paragraphOpcodes,
  splitIntoLineBuckets,
  splitIntoPages,
  splitParagraphs,
  splitWords,
  wordDiffSpans,
} from "./diff";

describe("splitParagraphs", () => {
  it("splits on two or more newlines and trims", () => {
    expect(splitParagraphs("a\n\nb")).toEqual(["a", "b"]);
    expect(splitParagraphs(" a \n\n\n b ")).toEqual(["a", "b"]);
    expect(splitParagraphs("")).toEqual([]);
  });
});

describe("splitWords", () => {
  it("matches Python str.split() whitespace semantics", () => {
    expect(splitWords("  hello   world  ")).toEqual(["hello", "world"]);
    expect(splitWords("")).toEqual([]);
  });
});

describe("paragraphOpcodes", () => {
  it("merges adjacent delete+insert into replace", () => {
    const ops = paragraphOpcodes(["A", "B"], ["A", "C"]);
    expect(ops).toContainEqual(["equal", 0, 1, 0, 1]);
    expect(ops).toContainEqual(["replace", 1, 2, 1, 2]);
  });

  it("handles pure insert", () => {
    const ops = paragraphOpcodes(["A"], ["A", "B"]);
    expect(ops.some((o) => o[0] === "insert")).toBe(true);
  });
});

describe("wordDiffSpans", () => {
  it("highlights changed words in a single paragraph", () => {
    const { left, right } = wordDiffSpans("the quick fox", "the lazy fox");
    expect(left.some((s) => s.type === "delete" && s.text === "quick")).toBe(true);
    expect(right.some((s) => s.type === "insert" && s.text === "lazy")).toBe(true);
    expect(left.some((s) => s.type === "equal" && s.text === "the")).toBe(true);
  });
});

describe("splitIntoPages", () => {
  it("returns one segment when no form-feed", () => {
    expect(splitIntoPages("a\nb")).toEqual(["a\nb"]);
  });

  it("splits on form-feed (PDF page break)", () => {
    expect(splitIntoPages("pageA\fpageB")).toEqual(["pageA", "pageB"]);
  });
});

describe("splitIntoLineBuckets", () => {
  it("chunks by line count", () => {
    expect(splitIntoLineBuckets("a\nb\nc\nd", 2)).toEqual(["a\nb", "c\nd"]);
  });
});

describe("buildPageWiseLineDiff", () => {
  it("aggregates stats across pages", () => {
    const oldT = "L1\nL2\fP2a\nP2b";
    const newT = "L1\nL2x\fP2a\nP2b";
    const { pages, totalStats, usedFormFeedPageBoundaries, baselinePageCount, currentPageCount } =
      buildPageWiseLineDiff(oldT, newT, 2);
    expect(usedFormFeedPageBoundaries).toBe(true);
    expect(pages.length).toBe(2);
    expect(baselinePageCount).toBe(2);
    expect(currentPageCount).toBe(2);
    expect(totalStats.replaced).toBeGreaterThan(0);
  });

  it("pads when baseline has more pages than current", () => {
    const oldT = "A\n\fB\n\fC\n";
    const newT = "A\n";
    const r = buildPageWiseLineDiff(oldT, newT, 2);
    expect(r.baselinePageCount).toBe(3);
    expect(r.currentPageCount).toBe(1);
    expect(r.pages.length).toBe(3);
  });

  it("pads when current has more pages than baseline", () => {
    const oldT = "only\n";
    const newT = "X\n\fY\n\fZ\n";
    const r = buildPageWiseLineDiff(oldT, newT, 2);
    expect(r.baselinePageCount).toBe(1);
    expect(r.currentPageCount).toBe(3);
    expect(r.pages.length).toBe(3);
  });

  it("splits into multiple logical pages by line count when no form-feed", () => {
    const oldT = "l1\nl2\nl3\nl4";
    const newT = "l1\nl2\nl3\nl4";
    const r = buildPageWiseLineDiff(oldT, newT, 0, { linesPerLogicalPageWhenNoFormFeed: 2 });
    expect(r.usedFormFeedPageBoundaries).toBe(false);
    expect(r.lineBucketPagination).toBe(true);
    expect(r.linesPerLogicalPageWhenNoFormFeed).toBe(2);
    expect(r.baselinePageCount).toBe(2);
    expect(r.currentPageCount).toBe(2);
    expect(r.pages.length).toBe(2);
  });
});

describe("buildSideBySideRows", () => {
  it("counts stats for add/remove/replace", () => {
    const oldT = "p1\n\np2\n\np3";
    const newT = "p1\n\np2 changed\n\np3\n\np4";
    const { stats, rows } = buildSideBySideRows(oldT, newT, 2);
    expect(stats.added + stats.replaced + stats.removed).toBeGreaterThan(0);
    expect(rows.some((r) => r.kind === "pair")).toBe(true);
  });

  it("emits message row when context is zero and texts are identical", () => {
    const t = "only\n\npara";
    const { rows } = buildSideBySideRows(t, t, 0);
    expect(rows).toEqual([{ kind: "message", text: "No changes to display." }]);
  });

  it("uses word-level replace for 1:1 paragraph change", () => {
    const oldT = "hello world";
    const newT = "hello there";
    const { rows } = buildSideBySideRows(oldT, newT, 2);
    const pair = rows.find((r) => r.kind === "pair" && r.highlight === "word_replace");
    expect(pair && pair.kind === "pair").toBeTruthy();
    if (pair && pair.kind === "pair") {
      expect(pair.left.spans?.length).toBeGreaterThan(0);
      expect(pair.right.spans?.length).toBeGreaterThan(0);
    }
  });
});

describe("buildUnifiedDiffLines", () => {
  it("includes file headers and at least one hunk for a simple line change", () => {
    const lines = buildUnifiedDiffLines("a\nb", "a\nc", 3);
    expect(lines.some((l) => l.type === "header" && l.text.startsWith("---"))).toBe(true);
    expect(lines.some((l) => l.type === "hunk" && l.text.startsWith("@@"))).toBe(true);
    expect(lines.some((l) => l.type === "del" && l.text === "b")).toBe(true);
    expect(lines.some((l) => l.type === "add" && l.text === "c")).toBe(true);
  });
});

describe("filterSideBySideRows", () => {
  it("hides insert rows when showNewLine is false", () => {
    const { rows } = buildSideBySideLineRows("a\n", "a\nb\n", 1);
    const inserts = rows.filter((r) => r.kind === "pair" && r.highlight === "block_insert");
    expect(inserts.length).toBeGreaterThan(0);
    const filtered = filterSideBySideRows(rows, {
      showNewLine: false,
      showModifiedLine: true,
      showDeletedLine: true,
    });
    expect(filtered.some((r) => r.kind === "pair" && r.highlight === "block_insert")).toBe(false);
  });
});

describe("classifyUnifiedLineCategories and filterUnifiedDiffLines", () => {
  it("marks consecutive del then add as modified", () => {
    const lines = [
      { type: "hunk" as const, text: "@@ -1,3 +1,3 @@" },
      { type: "ctx" as const, text: "unchanged" },
      { type: "del" as const, text: "removed" },
      { type: "add" as const, text: "added" },
    ];
    const cats = classifyUnifiedLineCategories(lines);
    expect(cats[2]).toBe("modified");
    expect(cats[3]).toBe("modified");
  });

  it("filters out modified lines when showModifiedLine is false", () => {
    const lines = [
      { type: "hunk" as const, text: "@@ @@" },
      { type: "del" as const, text: "old" },
      { type: "add" as const, text: "new" },
    ];
    const filtered = filterUnifiedDiffLines(lines, {
      showNewLine: true,
      showModifiedLine: false,
      showDeletedLine: true,
    });
    expect(filtered.some((l) => l.type === "del")).toBe(false);
    expect(filtered.some((l) => l.type === "add")).toBe(false);
    expect(filtered.some((l) => l.type === "hunk")).toBe(true);
  });
});
