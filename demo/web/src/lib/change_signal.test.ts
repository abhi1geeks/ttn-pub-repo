import { describe, expect, it } from "vitest";
import { changeKindLabel, inferDemoChangeKind } from "./change_signal";

describe("change_signal", () => {
  it("infers amendment when chunks added and removed", () => {
    expect(inferDemoChangeKind({ newChunks: 3, removedChunks: 2 })).toBe("amendment");
  });

  it("infers addition when only new chunks", () => {
    expect(inferDemoChangeKind({ newChunks: 5, removedChunks: 0 })).toBe("addition");
  });

  it("labels kinds for UI", () => {
    expect(changeKindLabel("repeal")).toContain("repeal");
  });
});
