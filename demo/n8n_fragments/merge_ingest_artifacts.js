// === Merge layout + changeRegions from HTTP: Process Ingest Artifacts into Qdrant run ===
const https = require('https');
const http = require('http');

const diff = $('Build & Write Run Record').first().json;
const raw = $input.first().json || {};
// n8n HTTP node may nest JSON under .body depending on version/options.
const art = raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body) ? raw.body : raw;
const runRecord = diff.runRecord || {};
const runPointId = diff.runPointId;
if (!runPointId) return { json: diff };

const cfg = $('Set Config').first().json;
const qdrantUrl = cfg.qdrantUrl;
const qdrantApiKey = cfg.qdrantApiKey || '';
const runsColl = cfg.qdrantRunsCollection || 'regulatory_docs_runs';
const m = String(qdrantUrl).match(/^(https?):\/\/([^:/]+)(?::(\d+))?/);
if (!m) throw new Error('Invalid qdrantUrl');
const qProtocol = m[1];
const qHostname = m[2];
const qPort = m[3] ? parseInt(m[3], 10) : qProtocol === 'https' ? 443 : 80;
const qTransport = qProtocol === 'https' ? https : http;

const merge = {};
if (art.layoutArtifact) merge.layoutArtifact = art.layoutArtifact;
if (Array.isArray(art.changeRegions)) merge.changeRegions = art.changeRegions;
if (art.baselineVersionId) merge.diffBaselineVersionId = art.baselineVersionId;
if (art.diffArtifact) merge.diffArtifact = art.diffArtifact;
if (Array.isArray(art.alignedChanges)) merge.alignedChanges = art.alignedChanges;
if (art.alignedSummary && typeof art.alignedSummary === 'object') merge.alignedSummary = art.alignedSummary;
if (art.alignedArtifact) merge.alignedArtifact = art.alignedArtifact;

if (Object.keys(merge).length) {
  const payload = JSON.stringify({ payload: merge, points: [runPointId] });
  await new Promise((resolve, reject) => {
    const req = qTransport.request(
      {
        hostname: qHostname,
        port: qPort,
        path: `/collections/${runsColl}/points/payload`,
        method: 'POST',
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
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error('Qdrant payload merge ' + res.statusCode));
            return;
          }
          resolve();
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
  Object.assign(runRecord, merge);
}

return { json: { ...diff, runRecord } };
