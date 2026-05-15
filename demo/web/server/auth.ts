import crypto from "node:crypto";
import type { Request, Response } from "express";

const COOKIE = "regulatory_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isAuthEnabled(): boolean {
  const user = process.env.WEB_LOGIN_USER?.trim();
  const pass = process.env.WEB_LOGIN_PASSWORD ?? "";
  const secret = process.env.WEB_SESSION_SECRET?.trim() ?? "";
  return Boolean(user && pass.length > 0 && secret.length >= 16);
}

function expectedUser(): string {
  return process.env.WEB_LOGIN_USER?.trim() ?? "";
}

function secretKey(): string {
  return process.env.WEB_SESSION_SECRET?.trim() ?? "";
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    let v = part.slice(eq + 1).trim();
    try {
      v = decodeURIComponent(v);
    } catch {
      /* keep raw */
    }
    if (k) out[k] = v;
  }
  return out;
}

function hashPw(pw: string): Buffer {
  return crypto.createHash("sha256").update(pw, "utf8").digest();
}

export function verifyCredentials(username: string, password: string): boolean {
  const u = expectedUser();
  const expected = process.env.WEB_LOGIN_PASSWORD ?? "";
  if (!u || !expected) return false;
  const bu = Buffer.from(username, "utf8");
  const be = Buffer.from(u, "utf8");
  if (bu.length !== be.length) return false;
  if (!crypto.timingSafeEqual(bu, be)) return false;
  const hp = hashPw(password);
  const he = hashPw(expected);
  return hp.length === he.length && crypto.timingSafeEqual(hp, he);
}

function signPayload(payloadB64: string): string {
  const mac = crypto.createHmac("sha256", secretKey()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${mac}`;
}

function verifySigned(token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const payloadB64 = token.slice(0, i);
  const sig = token.slice(i + 1);
  const mac = crypto.createHmac("sha256", secretKey()).update(payloadB64).digest("base64url");
  const a = Buffer.from(mac, "utf8");
  const b = Buffer.from(sig, "utf8");
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  return payloadB64;
}

export function createSessionToken(username: string): string {
  const body = JSON.stringify({ sub: username, exp: Date.now() + MAX_AGE_MS });
  const payloadB64 = Buffer.from(body, "utf8").toString("base64url");
  return signPayload(payloadB64);
}

export function readSessionUser(cookieHeader: string | undefined): string | null {
  if (!isAuthEnabled()) return null;
  const raw = parseCookies(cookieHeader)[COOKIE];
  if (!raw) return null;
  const payloadB64 = verifySigned(raw);
  if (!payloadB64) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  if (typeof rec.sub !== "string" || typeof rec.exp !== "number") return null;
  if (rec.exp < Date.now()) return null;
  return rec.sub;
}

function cookieSecure(req: Request): boolean {
  if (process.env.WEB_COOKIE_SECURE === "1") return true;
  const xf = String(req.headers["x-forwarded-proto"] ?? "").toLowerCase();
  return xf === "https";
}

export function setSessionCookie(res: Response, token: string, req: Request): void {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
  ];
  if (cookieSecure(req)) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response, req: Request): void {
  const parts = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (cookieSecure(req)) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

export function registerAuthRoutes(app: import("express").Express): void {
  app.get("/api/auth/me", (req, res) => {
    if (!isAuthEnabled()) {
      res.json({ authRequired: false, user: null });
      return;
    }
    const user = readSessionUser(req.headers.cookie);
    res.json({ authRequired: true, user });
  });

  app.post("/api/auth/login", (req, res) => {
    if (!isAuthEnabled()) {
      res.status(400).json({ ok: false, error: "auth_disabled", message: "Login is not configured on this server." });
      return;
    }
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!username || !password) {
      res.status(400).json({ ok: false, error: "invalid_request", message: "Username and password are required." });
      return;
    }
    if (!verifyCredentials(username, password)) {
      res.status(401).json({ ok: false, error: "invalid_credentials", message: "Invalid username or password." });
      return;
    }
    const token = createSessionToken(expectedUser());
    setSessionCookie(res, token, req);
    res.json({ ok: true, user: expectedUser() });
  });

  app.post("/api/auth/logout", (req, res) => {
    if (isAuthEnabled()) clearSessionCookie(res, req);
    res.json({ ok: true });
  });
}

/** Require a valid session cookie for `/api/*` except health and `/api/auth/*`. */
export function registerAuthApiGate(app: import("express").Express): void {
  app.use((req, res, next) => {
    if (!isAuthEnabled()) {
      next();
      return;
    }
    if (!req.path.startsWith("/api")) {
      next();
      return;
    }
    if (req.path === "/api/health" || req.path.startsWith("/api/auth/")) {
      next();
      return;
    }
    const user = readSessionUser(req.headers.cookie);
    if (!user) {
      res.status(401).json({ error: "unauthorized", message: "Sign in required." });
      return;
    }
    next();
  });
}
