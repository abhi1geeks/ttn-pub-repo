// === Persist downloaded PDF to shared volume (per documentUrl + versionId) ===
// n8n 2.x stores large binaries on disk; use getBinaryDataBuffer (not bin.data string id).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const item = $input.item;
const cfg = $('Set Config').first().json;
const documentUrl = String(cfg.documentUrl || '').trim();
if (!documentUrl) throw new Error('Set Config.documentUrl is required');

const artifactsRoot = String(cfg.artifactsRoot || '/data/regulatory').replace(/\/+$/, '');
const urlHash = crypto.createHash('sha256').update(documentUrl).digest('hex').slice(0, 16);
const versionId = new Date().toISOString();
const pdfBasename = `${String(versionId).replace(/:/g, '-')}.pdf`;

let buffer;
if (typeof this !== 'undefined' && this.helpers && typeof this.helpers.getBinaryDataBuffer === 'function') {
  buffer = await this.helpers.getBinaryDataBuffer(0, 'data');
} else {
  const bin = item.binary && item.binary.data;
  if (!bin) throw new Error('No PDF binary on item — check Download PDF responseFormat=file');
  if (Buffer.isBuffer(bin.data)) {
    buffer = bin.data;
  } else if (typeof bin.data === 'string' && (bin.encoding === 'base64' || bin.data.length > 256)) {
    buffer = Buffer.from(bin.data, bin.encoding === 'base64' ? 'base64' : 'utf8');
  } else {
    throw new Error(
      'Binary is a filesystem reference, not inline data. Use n8n Code node v2 with getBinaryDataBuffer. ' +
        `data preview length=${String(bin.data || '').length}`,
    );
  }
}

if (!buffer || buffer.length < 100) {
  throw new Error(`PDF too small (${buffer ? buffer.length : 0} bytes) — download may have failed`);
}
if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
  const preview = buffer.subarray(0, 80).toString('utf8').replace(/\s+/g, ' ');
  throw new Error(`Not a PDF (missing %PDF- header). Preview: ${preview}`);
}

const relPath = `pdfs/${urlHash}/${pdfBasename}`;
const absDir = path.join(artifactsRoot, 'pdfs', urlHash);
const absPath = path.join(absDir, pdfBasename);
fs.mkdirSync(absDir, { recursive: true });
fs.writeFileSync(absPath, buffer, { mode: 0o644 });

const pdfSha256 = crypto.createHash('sha256').update(buffer).digest('hex');
const pdfArtifact = {
  path: relPath,
  sha256: pdfSha256,
  bytes: buffer.length,
  urlHash,
};

const prov = item.json || {};
return {
  json: {
    ...prov,
    versionId,
    documentUrl,
    urlHash,
    pdfArtifact,
  },
  binary: item.binary,
};
