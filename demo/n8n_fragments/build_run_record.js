// === Capture the diff as a run record before any inserts/deletes happen ===
const crypto = require('crypto');
const https = require('https');

// --- Inputs ---
const cfg = $('Set Config').first().json;
const diff = $json;

const qdrantApiKey = cfg.qdrantApiKey || '';
const chunksColl = cfg.qdrantCollection;
const runsColl = cfg.qdrantRunsCollection || 'regulatory_docs_runs';

// Parse Qdrant URL manually (URL global is not exposed in n8n's Code sandbox)
const m = String(cfg.qdrantUrl).match(/^(https?):\/\/([^:/]+)(?::(\d+))?/);
if (!m) throw new Error('Invalid qdrantUrl in Set Config: ' + cfg.qdrantUrl);
const qProtocol = m[1];
const qHostname = m[2];
const qPort = m[3] ? parseInt(m[3], 10) : (qProtocol === 'https' ? 443 : 80);
const transport = qProtocol === 'https' ? https : require('http');

// --- Promise-resolving Qdrant call (same pattern as the Bedrock node) ---
function qdrantCall(method, path, body) {
  const payload = body ? JSON.stringify(body) : '';
  return new Promise((resolve) => {
    const req = transport.request(
      {
        hostname: qHostname,
        port: qPort,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'api-key': qdrantApiKey,
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
        });
      },
    );
    req.on('error', (e) => resolve({ status: 0, body: 'NETWORK: ' + e.message }));
    if (payload) req.write(payload);
    req.end();
  });
}

function deterministicUuid(input) {
  const h = crypto.createHash('sha1').update(input).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

// --- 1. Fetch text of chunks that are about to be deleted ---
let removed = [];
if (Array.isArray(diff.toDeleteIds) && diff.toDeleteIds.length > 0) {
  const r = await qdrantCall('POST', `/collections/${chunksColl}/points`, {
    ids: diff.toDeleteIds,
    with_payload: true,
    with_vector: false,
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error('Qdrant fetch-stale failed ' + r.status + ': ' + r.body.slice(0, 400));
  }
  const parsed = JSON.parse(r.body);
  removed = (parsed.result || []).map((p) => ({
    pointId: p.id,
    chunkIndex: p.payload && p.payload.metadata && p.payload.metadata.chunkIndex,
    chunkHash: p.payload && p.payload.metadata && p.payload.metadata.chunkHash,
    previousVersionId: p.payload && p.payload.metadata && p.payload.metadata.versionId,
    chunkText: p.payload && p.payload.content,
  }));
}

// --- 2. Build the run record (deterministic Qdrant point id for upserts) ---
const runPointId = deterministicUuid(`run::${diff.documentUrl}::${diff.versionId}`);

const runRecord = {
  runId: diff.versionId + '_' + crypto.randomBytes(3).toString('hex'),
  timestamp: diff.versionId,
  versionId: diff.versionId,
  documentUrl: diff.documentUrl,
  documentHash: diff.documentHash,
  fullText: $('Chunk + Hash').first().json.fullText,
  ...(diff.pdfPageCount != null && diff.pdfPageCount !== ''
    ? { pdfPageCount: Number(diff.pdfPageCount) }
    : {}),
  summary: diff.summary,
  added: (diff.toInsert || []).map((c) => ({
    pointId: c.pointId,
    chunkIndex: c.chunkIndex,
    chunkHash: c.chunkHash,
    chunkText: c.chunkText,
  })),
  removed,
};

// --- 3. Write the run record to the runs collection ---
const w = await qdrantCall('PUT', `/collections/${runsColl}/points?wait=true`, {
  points: [{ id: runPointId, vector: [0.0], payload: runRecord }],
});
if (w.status < 200 || w.status >= 300) {
  throw new Error('Qdrant write-run failed ' + w.status + ': ' + w.body.slice(0, 400));
}

// --- 4. Pass through the original diff so downstream branches keep working ---
return { json: { ...diff, runRecord, runPointId } };
