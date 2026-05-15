import { describe, expect, it } from "vitest";
import { clampHitlReason, HITL_REASON_MAX_LEN, parseHitlReview } from "./uc1";

describe("clampHitlReason", () => {
  it("trims and normalizes newlines", () => {
    expect(clampHitlReason("  a\r\nb  ")).toBe("a\nb");
  });

  it("caps length", () => {
    const s = "x".repeat(HITL_REASON_MAX_LEN + 50);
    expect(clampHitlReason(s).length).toBe(HITL_REASON_MAX_LEN);
  });
});

describe("parseHitlReview", () => {
  it("accepts valid stored payload", () => {
    expect(
      parseHitlReview({
        status: "flagged",
        reason: "Check section 4",
        reviewedAt: "2026-01-01T00:00:00.000Z",
        source: "regulatory-web",
      }),
    ).toEqual({
      status: "flagged",
      reason: "Check section 4",
      reviewedAt: "2026-01-01T00:00:00.000Z",
      source: "regulatory-web",
    });
  });

  it("rejects invalid status", () => {
    expect(parseHitlReview({ status: "none" })).toBeUndefined();
    expect(parseHitlReview(null)).toBeUndefined();
  });
});
