/** Jump from RegGPT citation to Live index chunk card. */

export const CHUNK_ELEMENT_ID_PREFIX = "gli-chunk-";

export function chunkElementId(chunkIndex: number | string): string {
  return `${CHUNK_ELEMENT_ID_PREFIX}${chunkIndex}`;
}

export type NavigateToChunkDetail = {
  chunkIndex: number;
  tab?: "now";
};

export const NAVIGATE_TO_CHUNK_EVENT = "gli-navigate-to-chunk";

export function dispatchNavigateToChunk(detail: NavigateToChunkDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAVIGATE_TO_CHUNK_EVENT, { detail }));
}

export function highlightChunkElement(chunkIndex: number): void {
  const el = document.getElementById(chunkElementId(chunkIndex));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("ring-2", "ring-emerald-500", "ring-offset-2");
  window.setTimeout(() => {
    el.classList.remove("ring-2", "ring-emerald-500", "ring-offset-2");
  }, 2400);
}
