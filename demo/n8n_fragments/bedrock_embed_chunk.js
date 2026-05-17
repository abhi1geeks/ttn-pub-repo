// === Manual SigV4 signing for Bedrock (works around n8n issue #14623) ===
const crypto = require('crypto');
const https = require('https');

function formatNetError(e) {
  if (!e) return 'unknown';
  if (e.errors && Array.isArray(e.errors)) {
    return e.errors.map((x) => `${x.code || 'ERR'}: ${x.message || x}`).join('; ');
  }
  return e.message || String(e);
}

function looksLikeUnevaluatedExpression(s) {
  const t = String(s || '').trim();
  return (
    t.startsWith('={{') ||
    t.startsWith('{{') ||
    t.includes('$env.') ||
    t === "''" ||
    t === '""'
  );
}

function readEnv(name) {
  if (typeof $env === 'undefined' || $env == null) return '';
  const v = $env[name];
  return v == null ? '' : String(v).trim();
}

/** Prefer Set Config; fall back to $env when expressions were not evaluated. */
function pickCredential(cfgVal, ...envNames) {
  const fromCfg = String(cfgVal || '').trim();
  if (fromCfg && !looksLikeUnevaluatedExpression(fromCfg)) return fromCfg;
  for (const name of envNames) {
    const v = readEnv(name);
    if (v && !looksLikeUnevaluatedExpression(v)) return v;
  }
  return '';
}

/** Only send x-amz-security-token for real STS/session values (never unevaluated expressions). */
function normalizeSessionToken(v) {
  if (v == null || v === false) return null;
  const s = String(v).trim();
  if (!s || looksLikeUnevaluatedExpression(s)) return null;
  return s;
}

// --- Inputs: Set Config + $env fallback (task runner has no process.env) ---
const cfg = $('Set Config').first().json;
const region =
  pickCredential(cfg.awsRegion, 'AWS_REGION') || 'us-east-1';
const modelId = cfg.embedModelId;
const dimensions = cfg.embedDimensions;
const accessKeyId = pickCredential(
  cfg.awsAccessKeyId,
  'N8N_AWS_ACCESS_KEY_ID',
  'AWS_ACCESS_KEY_ID',
);
const secretAccessKey = pickCredential(
  cfg.awsSecretAccessKey,
  'N8N_AWS_SECRET_ACCESS_KEY',
  'AWS_SECRET_ACCESS_KEY',
);
// IAM user keys (AKIA…): never send x-amz-security-token (stale shell tokens break SigV4).
let sessionToken = null;
if (accessKeyId.startsWith('ASIA')) {
  sessionToken =
    normalizeSessionToken(cfg.awsSessionToken) ||
    normalizeSessionToken(readEnv('N8N_AWS_SESSION_TOKEN')) ||
    normalizeSessionToken(readEnv('AWS_SESSION_TOKEN'));
}
const chunkText = $json.chunkText;

if (!accessKeyId || !secretAccessKey) {
  throw new Error(
    'AWS credentials missing. Set demo/.env (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), ' +
      'restart n8n (./scripts/up.sh --n8n-only), and ensure Set Config evaluates or $env is available ' +
      '(N8N_BLOCK_ENV_ACCESS_IN_NODE=false).',
  );
}
if (accessKeyId.startsWith('ASIA') && !sessionToken) {
  throw new Error(
    'Temporary AWS key (ASIA…) requires AWS_SESSION_TOKEN in demo/.env for Bedrock SigV4.',
  );
}
if (!chunkText) {
  throw new Error('No chunkText on input item -- check upstream node mode and connections');
}

// --- SigV4 signing ---
const service = 'bedrock';
const host = `bedrock-runtime.${region}.amazonaws.com`;

const requestPath = `/model/${encodeURIComponent(modelId)}/invoke`;
const canonicalUri = `/model/${encodeURIComponent(encodeURIComponent(modelId))}/invoke`;

const body = JSON.stringify({ inputText: chunkText, dimensions, normalize: true });
const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
const dateStamp = amzDate.slice(0, 8);
const payloadHash = crypto.createHash('sha256').update(body).digest('hex');

const headersToSign = {
  'content-type': 'application/json',
  host: host,
  'x-amz-content-sha256': payloadHash,
  'x-amz-date': amzDate,
};
if (sessionToken) headersToSign['x-amz-security-token'] = sessionToken;

const sortedKeys = Object.keys(headersToSign).sort();
const canonicalHeaders = sortedKeys.map((k) => `${k}:${headersToSign[k]}\n`).join('');
const signedHeaders = sortedKeys.join(';');

const canonicalRequest = ['POST', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
const stringToSign = [
  'AWS4-HMAC-SHA256',
  amzDate,
  credentialScope,
  crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
].join('\n');

const kDate = crypto.createHmac('sha256', 'AWS4' + secretAccessKey).update(dateStamp).digest();
const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

const authorization =
  `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
  `SignedHeaders=${signedHeaders}, Signature=${signature}`;

const httpResult = await new Promise((resolve) => {
  const req = https.request(
    {
      hostname: host,
      path: requestPath,
      method: 'POST',
      family: 4,
      headers: {
        'Content-Type': 'application/json',
        'X-Amz-Date': amzDate,
        'X-Amz-Content-Sha256': payloadHash,
        Authorization: authorization,
        ...(sessionToken ? { 'X-Amz-Security-Token': sessionToken } : {}),
      },
    },
    (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          ok: true,
          status: res.statusCode,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    },
  );
  req.on('error', (e) => resolve({ ok: false, error: formatNetError(e) }));
  req.write(body);
  req.end();
});

if (!httpResult.ok) {
  throw new Error(
    `Bedrock network error (${host}): ${httpResult.error}. ` +
      'From the n8n container: check outbound HTTPS, DNS, and AWS credentials in demo/.env.',
  );
}
if (httpResult.status < 200 || httpResult.status >= 300) {
  const snippet = httpResult.body.slice(0, 800);
  if (httpResult.status === 403 && snippet.includes('security token')) {
    const keyKind = accessKeyId.startsWith('ASIA') ? 'ASIA (temporary)' : 'AKIA/other';
    throw new Error(
      `Bedrock HTTP 403 (${keyKind} key): auth failed. ` +
        'Recreate n8n without host-shell AWS_SESSION_TOKEN: unset AWS_SESSION_TOKEN AWS_PROFILE; ' +
        './scripts/up.sh --n8n-only. For AKIA keys, demo/.env must not set AWS_SESSION_TOKEN. ' +
        'Detail: ' +
        snippet,
    );
  }
  throw new Error('Bedrock HTTP ' + httpResult.status + ': ' + snippet);
}

let parsed;
try {
  parsed = JSON.parse(httpResult.body);
} catch (_) {
  throw new Error('Bedrock returned non-JSON: ' + httpResult.body.slice(0, 800));
}

if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
  throw new Error('Bedrock response was not a JSON object: ' + JSON.stringify(parsed).slice(0, 500));
}
if (!Array.isArray(parsed.embedding)) {
  throw new Error('Bedrock response missing embedding array: ' + JSON.stringify(parsed).slice(0, 500));
}

return { json: parsed };
