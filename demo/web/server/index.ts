import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { buildSideBySideRows, buildUnifiedDiffLines } from "../src/lib/diff";
import { extractScrollPoints, qdrantPost } from "./qdrant";

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
  if (process.env.NODE_ENV === "production") {
    // eslint-disable-next-line no-console
    console.log(`[regulatory-web] Serving static from ${dist}`);
  }
});
