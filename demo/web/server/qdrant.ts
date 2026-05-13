const DEFAULT_TIMEOUT_MS = 30_000;

export type QdrantScrollBody = Record<string, unknown>;

export async function qdrantPost(
  baseUrl: string,
  apiKey: string | undefined,
  path: string,
  body: QdrantScrollBody,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["api-key"] = apiKey;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Qdrant ${r.status}: ${text.slice(0, 500)}`);
    }
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export function extractScrollPoints(res: unknown): { id: unknown; payload: Record<string, unknown> }[] {
  const r = res as {
    result?: { points?: { id?: unknown; payload?: Record<string, unknown> }[] };
  };
  const pts = r.result?.points ?? [];
  return pts.map((p) => ({
    id: p.id,
    payload: (p.payload ?? {}) as Record<string, unknown>,
  }));
}
