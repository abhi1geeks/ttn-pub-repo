import { describe, expect, it } from "vitest";
import { readAppRouteFromLocation } from "./app_route";

describe("app_route", () => {
  it("defaults to hub", () => {
    const r = readAppRouteFromLocation();
    expect(r.surface).toBe("gli_hub");
  });
});
