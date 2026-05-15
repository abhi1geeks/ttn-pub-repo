// === Chunk + content-hash + deterministic point IDs + ingest metadata (UC2-003 / XC-004) ===
const crypto = require('crypto');

const rawText = ($input.first().json.text || '').toString();
if (!rawText || rawText.trim().length < 50) {
  throw new Error('No usable text extracted from PDF');
}

// Light normalisation so cosmetic re-flows do not invalidate hashes.
// Preserve form-feed page breaks (\f) for logical PDF-style pagination in the web UI.
const text = rawText
  .replace(/\r\n/g, '\n')
  .replace(/[\t ]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const cfg = $('Set Config').first().json;
const prov = $('Code: Ingest Provenance').first().json || {};
const documentUrl = cfg.documentUrl;
const chunkSize = cfg.chunkSize || 1500;
const chunkOverlap = cfg.chunkOverlap || 200;
const productLine = String(cfg.productLine || 'default').trim() || 'default';
const jurisdiction = String(cfg.jurisdiction || '').trim();
const effectiveDate = String(cfg.effectiveDate || '').trim();

// Soft-boundary recursive splitter: prefer paragraph -> sentence -> word.
function splitText(t, size, overlap) {
  const out = [];
  let start = 0;
  while (start < t.length) {
    let end = Math.min(start + size, t.length);
    if (end < t.length) {
      const minBreak = start + Math.floor(size * 0.5);
      const para = t.lastIndexOf('\n\n', end);
      const sent = t.lastIndexOf('. ', end);
      const space = t.lastIndexOf(' ', end);
      if (para > minBreak) end = para + 2;
      else if (sent > minBreak) end = sent + 2;
      else if (space > minBreak) end = space + 1;
    }
    const slice = t.slice(start, end).trim();
    if (slice.length) out.push(slice);
    if (end >= t.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

const chunks = splitText(text, chunkSize, chunkOverlap);
const versionId = new Date().toISOString();
const documentHash = crypto.createHash('sha256').update(text).digest('hex');

const pdfParts = rawText.split('\f');
let pdfPageCount = Math.max(1, pdfParts.length);
const extractMeta = $('Extract PDF Text').first().json || {};
const extPages = Number(extractMeta.numpages ?? extractMeta.numPages ?? extractMeta.pageCount);
if (Number.isFinite(extPages) && extPages > 0) {
  pdfPageCount = Math.max(pdfPageCount, Math.floor(extPages));
}
const pdfPageCountSource =
  pdfParts.length > 1 ? 'formfeed' : Number.isFinite(extPages) && extPages > 0 ? 'extractor' : 'single_block';

// Deterministic UUIDv5-style ID derived from input string.
function deterministicUuid(input) {
  const h = crypto.createHash('sha1').update(input).digest();
  h[6] = (h[6] & 0x0f) | 0x50; // version 5
  h[8] = (h[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = h.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

const n = chunks.length;

return chunks.map((chunkText, index) => {
  const chunkHash = crypto.createHash('sha256').update(chunkText).digest('hex');
  const pointId = deterministicUuid(`${documentUrl}::${chunkHash}`);
  const lo = Math.floor((index / n) * pdfPageCount) + 1;
  const hi = Math.min(pdfPageCount, Math.ceil(((index + 1) / n) * pdfPageCount));
  const out = {
    json: {
      pointId,
      chunkHash,
      chunkIndex: index,
      chunkText,
      documentUrl,
      documentHash,
      versionId,
      productLine,
      jurisdiction,
      effectiveDate,
      pdfPageCount,
      pdfPageCountSource,
      chunkPageStart: lo,
      chunkPageEnd: Math.max(lo, hi),
      ingestHttpStatus: prov.ingestHttpStatus ?? null,
      ingestFetchedAt: prov.ingestFetchedAt || null,
      ingestContentLength: prov.ingestContentLength ?? null,
      ingestEtag: prov.ingestEtag ?? null,
      ingestLastModified: prov.ingestLastModified ?? null,
      ingestBytes: prov.ingestBytes ?? null,
      ingestError: prov.ingestError ?? null,
    },
  };
  if (index === 0) out.json.fullText = text;
  return out;
});
