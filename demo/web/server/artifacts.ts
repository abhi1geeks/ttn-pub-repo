import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function artifactsRoot(): string {
  return (process.env.ARTIFACTS_ROOT || "/data/regulatory").replace(/\/+$/, "");
}

export function documentUrlHash(documentUrl: string): string {
  return crypto.createHash("sha256").update(documentUrl.trim()).digest("hex").slice(0, 16);
}

/** Resolve a relative artifact path under ARTIFACTS_ROOT; rejects traversal. */
export function resolveArtifactPath(relPath: string): string | null {
  const root = path.resolve(artifactsRoot());
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..") || normalized.startsWith("..")) return null;
  const abs = path.resolve(root, normalized);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

export function readArtifactJson<T>(relPath: string): T | null {
  const abs = resolveArtifactPath(relPath);
  if (!abs || !fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8")) as T;
  } catch {
    return null;
  }
}

export function artifactExists(relPath: string): boolean {
  const abs = resolveArtifactPath(relPath);
  return Boolean(abs && fs.existsSync(abs));
}
