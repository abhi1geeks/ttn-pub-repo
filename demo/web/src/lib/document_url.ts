/** Canonical POC PDF + GitHub raw URL aliasing for Qdrant run matching. */

/** Matches n8n_workflow.json and resource.md (no /refs/heads/ segment). */
export const DEMO_CANONICAL_PDF =
  "https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/regulation-14-as-of-02-26.pdf";

/** Legacy catalogue form — treat as the same document as DEMO_CANONICAL_PDF. */
export const DEMO_CANONICAL_PDF_REFS_HEADS =
  "https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/regulation-14-as-of-02-26.pdf";

export function normalizeDocumentUrl(url: string): string {
  let u = url.trim();
  if (!u) return u;
  u = u.replace(
    "https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/refs/heads/main/",
    "https://raw.githubusercontent.com/abhi1geeks/ttn-pub-repo/main/",
  );
  return u;
}

export function documentUrlsMatch(a: string, b: string): boolean {
  return normalizeDocumentUrl(a) === normalizeDocumentUrl(b);
}

export function expandDocumentUrlAliases(url: string): string[] {
  const n = normalizeDocumentUrl(url);
  const out = new Set<string>([url.trim(), n]);
  if (n === DEMO_CANONICAL_PDF) out.add(DEMO_CANONICAL_PDF_REFS_HEADS);
  if (n === normalizeDocumentUrl(DEMO_CANONICAL_PDF_REFS_HEADS)) out.add(DEMO_CANONICAL_PDF);
  return [...out];
}
