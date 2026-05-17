/** CSV 1.2 — demo heuristic for amendment / addition / repeal from chunk deltas. */

export type DemoChangeKind = "no_change" | "addition" | "amendment" | "repeal" | "mixed";

export type ChunkDeltaSummary = {
  newChunks?: number;
  removedChunks?: number;
  totalChunks?: number;
};

export function inferDemoChangeKind(current: ChunkDeltaSummary): DemoChangeKind {
  const added = current.newChunks ?? 0;
  const removed = current.removedChunks ?? 0;
  if (added === 0 && removed === 0) return "no_change";
  if (added > 0 && removed === 0) return "addition";
  if (removed > 0 && added === 0) return "repeal";
  if (added > 0 && removed > 0) return "amendment";
  return "mixed";
}

export function changeKindLabel(kind: DemoChangeKind): string {
  switch (kind) {
    case "no_change":
      return "No chunk delta";
    case "addition":
      return "Likely addition (demo)";
    case "amendment":
      return "Likely amendment (demo)";
    case "repeal":
      return "Likely removal / repeal signal (demo)";
    default:
      return "Mixed delta (demo)";
  }
}

export function changeKindBadgeClass(kind: DemoChangeKind): string {
  switch (kind) {
    case "addition":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200";
    case "amendment":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "repeal":
      return "bg-red-100 text-red-900 ring-red-200";
    case "mixed":
      return "bg-violet-100 text-violet-900 ring-violet-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-zinc-200";
  }
}
