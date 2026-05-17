import { describe, expect, it } from "vitest";
import { welcomeUsernameDisplay } from "./auth_display";

describe("welcomeUsernameDisplay", () => {
  it("returns null for empty", () => {
    expect(welcomeUsernameDisplay(null)).toBeNull();
    expect(welcomeUsernameDisplay("  ")).toBeNull();
  });

  it("capitalizes simple username", () => {
    expect(welcomeUsernameDisplay("demo")).toBe("Demo");
    expect(welcomeUsernameDisplay("joy")).toBe("Joy");
  });

  it("handles separators like underscores", () => {
    expect(welcomeUsernameDisplay("mary_jane")).toBe("Mary Jane");
  });

  it("uses local-part-ish fragment before @", () => {
    expect(welcomeUsernameDisplay("first.last@example.com")).toBe("First Last");
  });
});
