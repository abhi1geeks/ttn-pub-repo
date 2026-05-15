import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, isAuthEnabled, readSessionUser, verifyCredentials } from "../../server/auth";

describe("web BFF auth", () => {
  beforeEach(() => {
    process.env.WEB_LOGIN_USER = "demo";
    process.env.WEB_LOGIN_PASSWORD = "demo-secret";
    process.env.WEB_SESSION_SECRET = "unit-test-secret-16";
  });

  afterEach(() => {
    delete process.env.WEB_LOGIN_USER;
    delete process.env.WEB_LOGIN_PASSWORD;
    delete process.env.WEB_SESSION_SECRET;
  });

  it("isAuthEnabled when all env set", () => {
    expect(isAuthEnabled()).toBe(true);
  });

  it("verifyCredentials accepts configured user and password", () => {
    expect(verifyCredentials("demo", "demo-secret")).toBe(true);
    expect(verifyCredentials("demo", "wrong")).toBe(false);
    expect(verifyCredentials("other", "demo-secret")).toBe(false);
  });

  it("round-trip session cookie", () => {
    const tok = createSessionToken("demo");
    const cookie = `irrelevant=1; regulatory_session=${encodeURIComponent(tok)}`;
    expect(readSessionUser(cookie)).toBe("demo");
    expect(readSessionUser("")).toBe(null);
  });
});
