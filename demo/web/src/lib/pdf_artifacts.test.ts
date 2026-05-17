import { describe, expect, it } from "vitest";
import {
  A4_WIDTH_PT,
  bboxToViewport,
  filterRegionsByKind,
  regionFill,
  regionsForPdfSide,
  scaleToFitPaneWidth,
  type ChangeRegion,
} from "./pdf_artifacts";

const box = [0, 0, 1, 1] as [number, number, number, number];
const sample: ChangeRegion[] = [
  { page: 1, kind: "delete", bbox: box },
  { page: 1, kind: "insert", bbox: box },
  { page: 1, kind: "replace", bbox: box },
];

describe("bboxToViewport", () => {
  it("maps top-left PDF coords to viewport pixels", () => {
    const r = bboxToViewport([72, 100, 200, 120], 612, 792, 612, 792);
    expect(r).not.toBeNull();
    expect(r!.x).toBe(72);
    expect(r!.y).toBe(100);
    expect(r!.w).toBe(128);
    expect(r!.h).toBe(20);
  });

  it("scales bbox when viewport is zoomed", () => {
    const r = bboxToViewport([72, 100, 200, 120], 612, 792, 1224, 1584);
    expect(r!.x).toBe(144);
    expect(r!.y).toBe(200);
    expect(r!.w).toBe(256);
    expect(r!.h).toBe(40);
  });

  it("returns null for boxes outside the page", () => {
    expect(bboxToViewport([700, 900, 800, 950], 612, 792, 612, 792)).toBeNull();
  });
});

describe("regionFill", () => {
  it("returns distinct fills per kind", () => {
    expect(regionFill("delete")).toContain("239");
    expect(regionFill("insert")).toContain("34");
    expect(regionFill("replace")).toContain("234");
  });
});

describe("scaleToFitPaneWidth", () => {
  it("fits A4 width into a typical side-by-side pane", () => {
    const scale = scaleToFitPaneWidth(520, A4_WIDTH_PT);
    expect(scale).toBeGreaterThan(0.8);
    expect(scale).toBeLessThan(1.1);
    expect(Math.round(A4_WIDTH_PT * scale)).toBeLessThanOrEqual(520);
  });
});

describe("filterRegionsByKind", () => {
  it("filters by legend selection", () => {
    expect(filterRegionsByKind(sample, { delete: true, insert: false, replace: false })).toHaveLength(1);
    expect(filterRegionsByKind(sample, { delete: false, insert: true, replace: false })[0]?.kind).toBe("insert");
  });
});

describe("regionsForPdfSide", () => {
  it("splits regions by pane", () => {
    const regions = [
      { page: 1, kind: "delete" as const, bbox: [0, 0, 1, 1] as [number, number, number, number] },
      { page: 1, kind: "insert" as const, bbox: [0, 0, 1, 1] as [number, number, number, number] },
      { page: 1, kind: "replace" as const, bbox: [0, 0, 1, 1] as [number, number, number, number] },
    ];
    expect(regionsForPdfSide(regions, "baseline").map((r) => r.kind)).toEqual(["delete", "replace"]);
    expect(regionsForPdfSide(regions, "current").map((r) => r.kind)).toEqual(["insert", "replace"]);
  });
});
