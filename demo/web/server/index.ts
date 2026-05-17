import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { buildSideBySideRows, buildUnifiedDiffLines } from "../src/lib/diff";
import { documentUrlsMatch } from "../src/lib/document_url";
import { registerAuthApiGate, registerAuthRoutes, isAuthEnabled } from "./auth";
import { extractRetrieveFirst, extractScrollPoints, qdrantPost } from "./qdrant";
import {
  artifactExists,
  documentUrlHash,
  readArtifactJson,
  resolveArtifactPath,
} from "./artifacts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load `web/.env` into `process.env` when keys are unset (tsx does not load it by default). */
function loadLocalEnvFile(): void {
  const envPath = path.join(__dirname, "..", ".env");
  let raw: string;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    // Treat "" like unset so a blank shell export does not block values from `web/.env`.
    const cur = process.env[key];
    if (cur === undefined || cur === "") process.env[key] = val;
  }
}

loadLocalEnvFile();

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

const QDRANT_URL = env("QDRANT_URL", "http://127.0.0.1:6333");
const QDRANT_API_KEY = env("QDRANT_API_KEY", "");
const RUNS_COLLECTION = env("RUNS_COLLECTION", "regulatory_docs_runs");
const CHUNKS_COLLECTION = env("CHUNKS_COLLECTION", "regulatory_docs");
const AGENTS_URL = env("AGENTS_URL", "").replace(/\/+$/, "");

/** Local dev defaults to 9780 so host port 8787 can stay free for Docker `web`; production keeps 8787. */
const isProd = process.env.NODE_ENV === "production";
const preferredPort = Number(env("WEB_PORT", isProd ? "8787" : "9780"));

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));

registerAuthRoutes(app);
registerAuthApiGate(app);

if (AGENTS_URL) {
  app.use("/api/agents", async (req, res) => {
    const pathAndQuery = req.originalUrl.replace(/^\/api\/agents/, "") || "/";
    const target = `${AGENTS_URL}${pathAndQuery}`;
    const headers: Record<string, string> = {};
    const xr = req.get("X-Request-Id");
    if (xr) headers["X-Request-Id"] = xr;
    const init: RequestInit = { method: req.method, headers };
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(req.body ?? {});
    }
    try {
      const r = await fetch(target, init);
      const text = await r.text();
      const ct = r.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.status(r.status).send(text);
    } catch (e) {
      res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    qdrantAuthHeader: Boolean(QDRANT_API_KEY),
    runsCollection: RUNS_COLLECTION,
    chunksCollection: CHUNKS_COLLECTION,
    agentsProxy: Boolean(AGENTS_URL),
    authRequired: isAuthEnabled(),
  });
});

app.get("/api/runs", async (_req, res) => {
  try {
    const out = await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${RUNS_COLLECTION}/points/scroll`, {
      limit: 1000,
      with_payload: true,
      with_vector: false,
    });
    const points = extractScrollPoints(out);
    const runs = points.map((p) => {
      const payload = p.payload as Record<string, unknown>;
      const id = p.id;
      const runPointId = id === undefined || id === null ? undefined : String(id);
      return runPointId ? { ...payload, runPointId } : { ...payload };
    }) as Record<string, unknown>[];
    runs.sort((a, b) => String(b.timestamp ?? "").localeCompare(String(a.timestamp ?? "")));
    res.json({ runs });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

const HITL_REASON_MAX = 2000;

app.post("/api/runs/review", async (req, res) => {
  const runPointId = String(req.body?.runPointId ?? "").trim();
  const status = String(req.body?.status ?? "").trim() as "none" | "acknowledged" | "flagged";
  const reasonRaw = typeof req.body?.reason === "string" ? req.body.reason : "";
  const reason = reasonRaw.replace(/\r\n/g, "\n").trim().slice(0, HITL_REASON_MAX);

  if (!runPointId || runPointId.length > 200) {
    res.status(400).json({ error: "Missing or invalid runPointId." });
    return;
  }
  if (status !== "none" && status !== "acknowledged" && status !== "flagged") {
    res.status(400).json({ error: "status must be none, acknowledged, or flagged." });
    return;
  }

  try {
    const retrieved = await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${RUNS_COLLECTION}/points`, {
      ids: [runPointId],
      with_payload: true,
      with_vector: false,
    });
    const first = extractRetrieveFirst(retrieved);
    if (!first) {
      res.status(404).json({ error: "Run point not found in Qdrant." });
      return;
    }

    if (status === "none") {
      await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${RUNS_COLLECTION}/points/delete_payload`, {
        points: [runPointId],
        keys: ["hitlReview"],
      });
      res.json({ ok: true, hitlReview: null });
      return;
    }

    const hitlReview = {
      status,
      ...(reason ? { reason } : {}),
      reviewedAt: new Date().toISOString(),
      source: "regulatory-web",
    };

    await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${RUNS_COLLECTION}/points/payload`, {
      payload: { hitlReview },
      points: [runPointId],
    });

    res.json({ ok: true, hitlReview });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

function findRunByUrlVersion(
  runs: Record<string, unknown>[],
  documentUrl: string,
  versionId: string,
): Record<string, unknown> | null {
  const v = versionId.trim();
  const u = documentUrl.trim();
  for (const r of runs) {
    if (
      documentUrlsMatch(String(r.documentUrl ?? ""), u) &&
      String(r.versionId ?? r.timestamp ?? "") === v
    ) {
      return r;
    }
  }
  return null;
}

function readLayoutForVersion(
  urlHash: string,
  versionId: string,
): { layout: Record<string, unknown>; path: string } | null {
  for (const vid of [versionId, versionId.replace(/:/g, "-")]) {
    const rel = `layout/${urlHash}/${vid}.json`;
    const layout = readArtifactJson<Record<string, unknown>>(rel);
    if (layout) return { layout, path: rel };
  }
  return null;
}

async function computeAlignedChangesViaAgents(
  documentUrl: string,
  baselineVersionId: string,
  currentVersionId: string,
  urlHash: string,
): Promise<{
  alignedChanges: unknown[];
  summary: Record<string, number>;
} | null> {
  if (!AGENTS_URL) return null;
  const r = await fetch(`${AGENTS_URL}/v1/ingest/aligned-changes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentUrl,
      baselineVersionId,
      currentVersionId,
      urlHash,
    }),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as {
    alignedChanges?: unknown[];
    summary?: Record<string, number>;
  };
  if (!Array.isArray(data.alignedChanges)) return null;
  return {
    alignedChanges: data.alignedChanges,
    summary: data.summary ?? {},
  };
}

async function computeDiffRegionsViaAgents(
  documentUrl: string,
  baselineVersionId: string,
  currentVersionId: string,
  urlHash: string,
): Promise<unknown[] | null> {
  if (!AGENTS_URL) return null;
  const r = await fetch(`${AGENTS_URL}/v1/ingest/diff-regions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      documentUrl,
      baselineVersionId,
      currentVersionId,
      urlHash,
    }),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { changeRegions?: unknown[]; regions?: unknown[] };
  const regions = data.changeRegions ?? data.regions;
  return Array.isArray(regions) ? regions : null;
}

app.get("/api/runs/pdf", async (req, res) => {
  const documentUrl = String(req.query.documentUrl ?? "").trim();
  const versionId = String(req.query.versionId ?? "").trim();
  if (!documentUrl || !versionId) {
    res.status(400).json({ error: "Missing documentUrl or versionId." });
    return;
  }
  try {
    const out = await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${RUNS_COLLECTION}/points/scroll`, {
      limit: 1000,
      with_payload: true,
      with_vector: false,
    });
    const points = extractScrollPoints(out);
    const runs = points.map((p) => p.payload as Record<string, unknown>);
    const run = findRunByUrlVersion(runs, documentUrl, versionId);
    const pdfArtifact = run?.pdfArtifact as { path?: string } | undefined;
    const rel = pdfArtifact?.path;
    if (!rel) {
      res.status(404).json({ error: "No pdfArtifact for this run. Re-run ingest with PDF storage enabled." });
      return;
    }
    const abs = resolveArtifactPath(rel);
    if (!abs || !artifactExists(rel)) {
      res.status(404).json({ error: "PDF file not found on artifact volume." });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${versionId.replace(/[^a-zA-Z0-9._-]/g, "_")}.pdf"`);
    fs.createReadStream(abs).pipe(res);
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/runs/diff-regions", async (req, res) => {
  const documentUrl = String(req.query.documentUrl ?? "").trim();
  const baselineVersionId = String(req.query.baselineVersionId ?? "").trim();
  const currentVersionId = String(req.query.currentVersionId ?? "").trim();
  if (!documentUrl || !baselineVersionId || !currentVersionId) {
    res.status(400).json({ error: "Missing documentUrl, baselineVersionId, or currentVersionId." });
    return;
  }
  try {
    const hash = documentUrlHash(documentUrl);
    const rel = `diff/${hash}/${baselineVersionId}__${currentVersionId}.json`;
    const data = readArtifactJson<{ regions?: unknown[] }>(rel);
    if (data?.regions && Array.isArray(data.regions) && data.regions.length) {
      res.json({ regions: data.regions, source: "artifact", path: rel });
      return;
    }
    const out = await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${RUNS_COLLECTION}/points/scroll`, {
      limit: 1000,
      with_payload: true,
      with_vector: false,
    });
    const runs = extractScrollPoints(out).map((p) => p.payload as Record<string, unknown>);
    const run = findRunByUrlVersion(runs, documentUrl, currentVersionId);
    const fromPayload = run?.changeRegions;
    if (Array.isArray(fromPayload) && fromPayload.length) {
      res.json({ regions: fromPayload, source: "qdrant" });
      return;
    }
    const computed = await computeDiffRegionsViaAgents(
      documentUrl,
      baselineVersionId,
      currentVersionId,
      hash,
    );
    if (computed?.length) {
      res.json({ regions: computed, source: "computed" });
      return;
    }
    const baseLayout = readLayoutForVersion(hash, baselineVersionId);
    const curLayout = readLayoutForVersion(hash, currentVersionId);
    if (!baseLayout || !curLayout) {
      res.status(404).json({
        error:
          "No layout JSON for one or both runs. Re-run ingest so HTTP: Process Ingest Artifacts succeeds on both versions.",
        hasBaselineLayout: Boolean(baseLayout),
        hasCurrentLayout: Boolean(curLayout),
      });
      return;
    }
    res.json({ regions: [], source: "computed-empty" });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/runs/aligned-changes", async (req, res) => {
  const documentUrl = String(req.query.documentUrl ?? "").trim();
  const baselineVersionId = String(req.query.baselineVersionId ?? "").trim();
  const currentVersionId = String(req.query.currentVersionId ?? "").trim();
  if (!documentUrl || !baselineVersionId || !currentVersionId) {
    res.status(400).json({ error: "Missing documentUrl, baselineVersionId, or currentVersionId." });
    return;
  }
  try {
    const hash = documentUrlHash(documentUrl);
    const rel = `aligned/${hash}/${baselineVersionId}__${currentVersionId}.json`;
    const data = readArtifactJson<{
      changes?: unknown[];
      alignedChanges?: unknown[];
      summary?: Record<string, number>;
    }>(rel);
    const changes = data?.changes ?? data?.alignedChanges;
    if (Array.isArray(changes) && changes.length) {
      res.json({
        alignedChanges: changes,
        summary: data?.summary ?? {},
        source: "artifact",
        path: rel,
      });
      return;
    }
    const out = await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${RUNS_COLLECTION}/points/scroll`, {
      limit: 1000,
      with_payload: true,
      with_vector: false,
    });
    const runs = extractScrollPoints(out).map((p) => p.payload as Record<string, unknown>);
    const run = findRunByUrlVersion(runs, documentUrl, currentVersionId);
    const fromPayload = run?.alignedChanges;
    if (Array.isArray(fromPayload) && fromPayload.length) {
      res.json({
        alignedChanges: fromPayload,
        summary: (run?.alignedSummary as Record<string, number>) ?? {},
        source: "qdrant",
      });
      return;
    }
    const computed = await computeAlignedChangesViaAgents(
      documentUrl,
      baselineVersionId,
      currentVersionId,
      hash,
    );
    if (computed?.alignedChanges?.length) {
      res.json({ ...computed, source: "computed" });
      return;
    }
    const baseLayout = readLayoutForVersion(hash, baselineVersionId);
    const curLayout = readLayoutForVersion(hash, currentVersionId);
    if (!baseLayout || !curLayout) {
      res.status(404).json({
        error:
          "No layout JSON for one or both runs. Re-run ingest so HTTP: Process Ingest Artifacts succeeds on both versions.",
        hasBaselineLayout: Boolean(baseLayout),
        hasCurrentLayout: Boolean(curLayout),
      });
      return;
    }
    res.json({
      alignedChanges: [],
      summary: { inserted: 0, deleted: 0, modified: 0, moved: 0 },
      source: "computed-empty",
    });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/runs/layout", async (req, res) => {
  const documentUrl = String(req.query.documentUrl ?? "").trim();
  const versionId = String(req.query.versionId ?? "").trim();
  if (!documentUrl || !versionId) {
    res.status(400).json({ error: "Missing documentUrl or versionId." });
    return;
  }
  try {
    const out = await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${RUNS_COLLECTION}/points/scroll`, {
      limit: 1000,
      with_payload: true,
      with_vector: false,
    });
    const runs = extractScrollPoints(out).map((p) => p.payload as Record<string, unknown>);
    const run = findRunByUrlVersion(runs, documentUrl, versionId);
    const layoutArtifact = run?.layoutArtifact as { path?: string } | undefined;
    const hash = documentUrlHash(documentUrl);
    let layout: Record<string, unknown> | null = null;
    let rel = layoutArtifact?.path ?? "";
    if (rel && artifactExists(rel)) {
      layout = readArtifactJson<Record<string, unknown>>(rel);
    }
    if (!layout) {
      const hit = readLayoutForVersion(hash, versionId);
      if (hit) {
        layout = hit.layout;
        rel = hit.path;
      }
    }
    if (!layout) {
      res.status(404).json({ error: "Layout not found for this run." });
      return;
    }
    res.json({ layout, path: rel });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/api/chunks", async (req, res) => {
  const documentUrl = String(req.query.documentUrl ?? "");
  if (!documentUrl) {
    res.status(400).json({ error: "Missing documentUrl query parameter." });
    return;
  }
  try {
    const out = await qdrantPost(QDRANT_URL, QDRANT_API_KEY || undefined, `/collections/${CHUNKS_COLLECTION}/points/scroll`, {
      filter: { must: [{ key: "metadata.documentUrl", match: { value: documentUrl } }] },
      limit: 10_000,
      with_payload: true,
      with_vector: false,
    });
    const points = extractScrollPoints(out);
    res.json({ points });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/api/diff", (req, res) => {
  const oldText = String(req.body?.oldText ?? "");
  const newText = String(req.body?.newText ?? "");
  const contextSize = Number(req.body?.contextSize ?? 2);
  const view = String(req.body?.view ?? "side-by-side");
  if (view === "unified") {
    const lines = buildUnifiedDiffLines(oldText, newText, 3);
    res.json({ view: "unified", lines });
    return;
  }
  const { rows, stats } = buildSideBySideRows(oldText, newText, Number.isFinite(contextSize) ? contextSize : 2);
  res.json({ view: "side-by-side", rows, stats });
});

const dist = path.join(__dirname, "../dist");

if (process.env.NODE_ENV === "production") {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(path.join(dist, "index.html"));
  });
}

const server = http.createServer(app);

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    // eslint-disable-next-line no-console
    console.error(
      `[regulatory-web] Port ${preferredPort} is already in use.\n` +
        `  • Stop the process using it (e.g. Docker service "web" mapped to ${preferredPort}), or\n` +
        `  • For local dev set WEB_PORT=9780 in web/.env (see .env.example) so it does not clash with Docker.`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.error("[regulatory-web] Server error:", err);
  }
  process.exit(1);
});

server.listen(preferredPort, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[regulatory-web] API listening on http://127.0.0.1:${preferredPort}`);
  if (isAuthEnabled()) {
    // eslint-disable-next-line no-console
    console.log("[regulatory-web] UI login is enabled (signed session cookie).");
  } else if (process.env.WEB_LOGIN_USER?.trim() && (process.env.WEB_LOGIN_PASSWORD?.length ?? 0) > 0) {
    const slen = process.env.WEB_SESSION_SECRET?.trim().length ?? 0;
    if (slen < 16) {
      // eslint-disable-next-line no-console
      console.warn(
        "[regulatory-web] WEB_LOGIN_USER/PASSWORD are set but WEB_SESSION_SECRET must be at least 16 characters. UI login stays disabled.",
      );
    }
  }
  if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.log(`[regulatory-web] Serving static from ${dist}`);
  }
});
