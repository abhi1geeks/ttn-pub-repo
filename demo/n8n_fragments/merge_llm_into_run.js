// === Merge SummaryAgent JSON into run payload and upsert same Qdrant point ===
const crypto = require('crypto');
const https = require('https');

const cfg = $('Set Config').first().json;
const base = $('Build & Write Run Record').first().json;
const llm = $input.first().json;

const qdrantApiKey = cfg.qdrantApiKey || '';
const runsColl = cfg.qdrantRunsCollection || 'regulatory_docs_runs';

const m = String(cfg.qdrantUrl).match(/^(https?):\/\/([^:/]+)(?::(\d+))?/);
if (!m) throw new Error('Invalid qdrantUrl in Set Config: ' + cfg.qdrantUrl);
const qProtocol = m[1];
const qHostname = m[2];
const qPort = m[3] ? parseInt(m[3], 10) : (qProtocol === 'https' ? 443 : 80);
const transport = qProtocol === 'https' ? https : require('http');

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

const runRecord = { ...base.runRecord };
runRecord.llmSummary = llm.llm_summary || llm.llmSummary || '';
runRecord.materialityNotes = llm.materiality_notes || llm.materialityNotes || '';
runRecord.materialityScore =
  llm.materiality_score != null && llm.materiality_score !== ''
    ? Number(llm.materiality_score)
    : llm.materialityScore != null && llm.materialityScore !== ''
      ? Number(llm.materialityScore)
      : undefined;
runRecord.agentsModelId = llm.model_id || llm.modelId || '';

const w = await qdrantCall('PUT', `/collections/${runsColl}/points?wait=true`, {
  points: [{ id: base.runPointId, vector: [0.0], payload: runRecord }],
});
if (w.status < 200 || w.status >= 300) {
  throw new Error('Qdrant merge-llm failed ' + w.status + ': ' + w.body.slice(0, 400));
}

return { json: { ...base, runRecord } };
