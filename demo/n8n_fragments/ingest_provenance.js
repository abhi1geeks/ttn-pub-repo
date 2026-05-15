// === Normalize HTTP download metadata for downstream nodes (XC-004 starter) ===
// Expects Download PDF with options.response.response.fullResponse = true and responseFormat = file.
// n8n 2.19+: in "Run Once for Each Item" mode use $input.item (not $input.first()).
const item = $input.item;
const j = item.json || {};
const status =
  typeof j.statusCode === 'number'
    ? j.statusCode
    : typeof j.status === 'number'
      ? j.status
      : 200;
const headersRaw = j.headers || {};
const headers = {};
for (const [k, v] of Object.entries(headersRaw)) {
  const key = String(k).toLowerCase();
  headers[key] = Array.isArray(v) ? v[0] : v;
}
const h = (name) => {
  const v = headers[name];
  return v == null ? null : String(v);
};
const bin = item.binary && item.binary.data;
let bytes = null;
if (bin && typeof bin.fileSize === 'number') bytes = bin.fileSize;

const fetchedAt = new Date().toISOString();

return {
  json: {
    ingestHttpStatus: status,
    ingestFetchedAt: fetchedAt,
    ingestContentLength: h('content-length'),
    ingestEtag: h('etag'),
    ingestLastModified: h('last-modified'),
    ingestBytes: bytes,
    ingestError: status >= 400 ? 'HTTP ' + status : null,
  },
  binary: item.binary,
};
