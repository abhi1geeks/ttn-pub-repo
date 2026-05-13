import { createTwoFilesPatch, diffArrays } from "diff";

/** Split paragraphs like Python `re.compile(r"\n{2,}")` + strip + drop empty */
export const PARA_SPLIT_RE = /\n{2,}/;

export function splitParagraphs(text: string | null | undefined): string[] {
  const t = text ?? "";
  return t.split(PARA_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
}

/** Python str.split() for words — any whitespace, no empty tokens */
export function splitWords(p: string): string[] {
  return p.trim().split(/\s+/).filter(Boolean);
}

export type Opcode = readonly [
  op: "equal" | "replace" | "delete" | "insert",
  i1: number,
  i2: number,
  j1: number,
  j2: number,
];

/**
 * Paragraph-level opcodes aligned with `difflib.SequenceMatcher` behavior
 * for typical paragraph arrays: merge adjacent delete+insert into `replace`.
 */
export function paragraphOpcodes(oldParas: string[], newParas: string[]): Opcode[] {
  const parts = diffArrays(oldParas, newParas);
  type Raw =
    | { t: "eq"; o0: number; o1: number; n0: number; n1: number }
    | { t: "del"; o0: number; o1: number; n0: number; n1: number }
    | { t: "ins"; o0: number; o1: number; n0: number; n1: number };
  const raw: Raw[] = [];
  let i = 0;
  let j = 0;
  for (const part of parts) {
    if (part.added && part.removed) continue;
    const vals = (part as { value?: unknown[] }).value ?? [];
    const n = (part as { count?: number }).count ?? vals.length;
    if (part.removed && !part.added) {
      raw.push({ t: "del", o0: i, o1: i + n, n0: j, n1: j });
      i += n;
    } else if (part.added && !part.removed) {
      raw.push({ t: "ins", o0: i, o1: i, n0: j, n1: j + n });
      j += n;
    } else if (!part.added && !part.removed) {
      raw.push({ t: "eq", o0: i, o1: i + n, n0: j, n1: j + n });
      i += n;
      j += n;
    }
  }

  const out: Opcode[] = [];
  for (let k = 0; k < raw.length; k++) {
    const cur = raw[k];
    if (cur.t === "del" && k + 1 < raw.length && raw[k + 1].t === "ins") {
      const nxt = raw[k + 1];
      out.push(["replace", cur.o0, cur.o1, nxt.n0, nxt.n1]);
      k++;
      continue;
    }
    if (cur.t === "eq") out.push(["equal", cur.o0, cur.o1, cur.n0, cur.n1]);
    else if (cur.t === "del") out.push(["delete", cur.o0, cur.o1, cur.n0, cur.n1]);
    else out.push(["insert", cur.o0, cur.o1, cur.n0, cur.n1]);
  }
  return out;
}

export function wordOpcodes(oldWords: string[], newWords: string[]): Opcode[] {
  return paragraphOpcodes(oldWords, newWords);
}

export type WordSpanType = "equal" | "delete" | "insert";

export type WordSpan = { type: WordSpanType; text: string };

export function wordDiffSpans(oldP: string, newP: string): { left: WordSpan[]; right: WordSpan[] } {
  const oldWords = splitWords(oldP);
  const newWords = splitWords(newP);
  const opcodes = wordOpcodes(oldWords, newWords);
  const left: WordSpan[] = [];
  const right: WordSpan[] = [];

  for (const [op, i1, i2, j1, j2] of opcodes) {
    const oldSeg = oldWords.slice(i1, i2).join(" ");
    const newSeg = newWords.slice(j1, j2).join(" ");
    if (op === "equal") {
      if (oldSeg) {
        left.push({ type: "equal", text: oldSeg });
        right.push({ type: "equal", text: newSeg });
      }
    } else if (op === "replace") {
      if (oldSeg) left.push({ type: "delete", text: oldSeg });
      if (newSeg) right.push({ type: "insert", text: newSeg });
    } else if (op === "delete") {
      if (oldSeg) left.push({ type: "delete", text: oldSeg });
    } else if (op === "insert") {
      if (newSeg) right.push({ type: "insert", text: newSeg });
    }
  }
  return { left, right };
}

export type DiffStats = {
  added: number;
  removed: number;
  replaced: number;
  unchanged: number;
};

export type SideBySideRow =
  | {
      kind: "pair";
      left: { empty?: boolean; dim?: boolean; paraNum?: number; spans?: WordSpan[]; plain?: string };
      right: { empty?: boolean; dim?: boolean; paraNum?: number; spans?: WordSpan[]; plain?: string };
      highlight?: "word_replace" | "block_delete" | "block_insert" | "block_replace";
    }
  | { kind: "collapse"; hiddenParagraphs: number; segmentLabel?: "paragraph" | "line" }
  | { kind: "message"; text: string };

/** Normalize newlines for line-based diff / page split. */
export function normalizeNewlines(text: string | null | undefined): string {
  return String(text ?? "").replace(/\r\n/g, "\n");
}

/** Split on single newlines (line-level diff). */
export function splitLines(text: string): string[] {
  return normalizeNewlines(text).split("\n");
}

/**
 * Split extracted PDF text into pages. PDF text layers often use form-feed (\\f / \\u000c) between pages.
 * If no page breaks are present, returns a single segment (whole document = one logical page).
 */
export function splitIntoPages(text: string | null | undefined): string[] {
  const t = normalizeNewlines(text);
  if (!t.includes("\f")) return [t];
  const parts = t.split(/\f+/).map((s) => s.trimEnd()).filter((s) => s.length > 0);
  return parts.length > 0 ? parts : [t.trimEnd() || ""];
}

/**
 * When `fullText` has no form-feed page breaks, split every `linesPerPage` lines for **UI pagination only**
 * (not true PDF page boundaries). Use 0 to disable (single logical page).
 */
export function splitIntoLineBuckets(text: string, linesPerPage: number): string[] {
  const t = normalizeNewlines(text);
  const n = Math.max(1, Math.floor(linesPerPage));
  const lines = splitLines(t);
  if (lines.length === 0) return [t];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += n) {
    out.push(lines.slice(i, i + n).join("\n"));
  }
  return out;
}

function buildRowsFromSegments(
  oldSegs: string[],
  newSegs: string[],
  contextSize: number,
  segmentLabel: "paragraph" | "line",
): { rows: SideBySideRow[]; stats: DiffStats } {
  const opcodes = paragraphOpcodes(oldSegs, newSegs);
  const rows: SideBySideRow[] = [];
  const stats: DiffStats = { added: 0, removed: 0, replaced: 0, unchanged: 0 };

  const appendPair = (row: SideBySideRow) => {
    rows.push(row);
  };

  const collapseRow = (n: number) => {
    rows.push({ kind: "collapse", hiddenParagraphs: n, segmentLabel });
  };

  for (let k = 0; k < opcodes.length; k++) {
    const [op, i1, i2, j1, j2] = opcodes[k];
    if (op === "equal") {
      const runLen = i2 - i1;
      stats.unchanged += runLen;

      if (contextSize === 0) continue;

      const isFirst = k === 0;
      const isLast = k === opcodes.length - 1;

      if (runLen <= 2 * contextSize + 1 || (isFirst && isLast)) {
        for (let offset = 0; offset < runLen; offset++) {
          const pOld = oldSegs[i1 + offset]!;
          const pNew = newSegs[j1 + offset]!;
          appendPair({
            kind: "pair",
            highlight: undefined,
            left: { dim: true, paraNum: i1 + offset, plain: pOld },
            right: { dim: true, paraNum: j1 + offset, plain: pNew },
          });
        }
      } else {
        const head = isFirst ? 0 : contextSize;
        const tail = isLast ? 0 : contextSize;
        for (let offset = 0; offset < head; offset++) {
          const p = oldSegs[i1 + offset]!;
          appendPair({
            kind: "pair",
            left: { dim: true, paraNum: i1 + offset, plain: p },
            right: { dim: true, paraNum: j1 + offset, plain: p },
          });
        }
        const hidden = runLen - head - tail;
        if (hidden > 0) collapseRow(hidden);
        for (let offset = 0; offset < tail; offset++) {
          const idxO = i2 - tail + offset;
          const idxN = j2 - tail + offset;
          const p = oldSegs[idxO]!;
          appendPair({
            kind: "pair",
            left: { dim: true, paraNum: idxO, plain: p },
            right: { dim: true, paraNum: idxN, plain: p },
          });
        }
      }
    } else if (op === "replace") {
      stats.replaced += Math.max(i2 - i1, j2 - j1);
      if (i2 - i1 === 1 && j2 - j1 === 1) {
        const { left, right } = wordDiffSpans(oldSegs[i1]!, newSegs[j1]!);
        appendPair({
          kind: "pair",
          highlight: "word_replace",
          left: { paraNum: i1, spans: left },
          right: { paraNum: j1, spans: right },
        });
      } else {
        const oldBlock = oldSegs.slice(i1, i2);
        const newBlock = newSegs.slice(j1, j2);
        const maxLen = Math.max(oldBlock.length, newBlock.length);
        for (let offset = 0; offset < maxLen; offset++) {
          appendPair({
            kind: "pair",
            highlight: "block_replace",
            left:
              offset < oldBlock.length
                ? { paraNum: i1 + offset, plain: oldBlock[offset]! }
                : { empty: true },
            right:
              offset < newBlock.length
                ? { paraNum: j1 + offset, plain: newBlock[offset]! }
                : { empty: true },
          });
        }
      }
    } else if (op === "delete") {
      stats.removed += i2 - i1;
      for (let offset = 0; offset < i2 - i1; offset++) {
        appendPair({
          kind: "pair",
          highlight: "block_delete",
          left: { paraNum: i1 + offset, plain: oldSegs[i1 + offset]! },
          right: { empty: true },
        });
      }
    } else if (op === "insert") {
      stats.added += j2 - j1;
      for (let offset = 0; offset < j2 - j1; offset++) {
        appendPair({
          kind: "pair",
          highlight: "block_insert",
          left: { empty: true },
          right: { paraNum: j1 + offset, plain: newSegs[j1 + offset]! },
        });
      }
    }
  }

  if (rows.length === 0) {
    rows.push({ kind: "message", text: "No changes to display." });
  }

  return { rows, stats };
}

export function buildSideBySideRows(
  oldText: string,
  newText: string,
  contextSize: number,
): { rows: SideBySideRow[]; stats: DiffStats } {
  return buildRowsFromSegments(splitParagraphs(oldText), splitParagraphs(newText), contextSize, "paragraph");
}

/** Line-level side-by-side (one table row per text line within a page). */
export function buildSideBySideLineRows(
  oldText: string,
  newText: string,
  contextSize: number,
): { rows: SideBySideRow[]; stats: DiffStats } {
  return buildRowsFromSegments(splitLines(oldText), splitLines(newText), contextSize, "line");
}

export type PageLineDiffPage = {
  pageIndex: number;
  rows: SideBySideRow[];
  stats: DiffStats;
  hasChanges: boolean;
};

export function buildPageWiseLineDiff(
  oldText: string,
  newText: string,
  contextSize: number,
  options?: { linesPerLogicalPageWhenNoFormFeed?: number },
): {
  pages: PageLineDiffPage[];
  totalStats: DiffStats;
  usedFormFeedPageBoundaries: boolean;
  lineBucketPagination: boolean;
  linesPerLogicalPageWhenNoFormFeed: number;
  baselinePageCount: number;
  currentPageCount: number;
} {
  const o = normalizeNewlines(oldText);
  const n = normalizeNewlines(newText);
  const useFormFeed = o.includes("\f") || n.includes("\f");
  const linesPer = Math.max(0, Math.floor(options?.linesPerLogicalPageWhenNoFormFeed ?? 0));

  let oldPages: string[];
  let newPages: string[];
  if (useFormFeed) {
    oldPages = splitIntoPages(o);
    newPages = splitIntoPages(n);
  } else if (linesPer > 0) {
    oldPages = splitIntoLineBuckets(o, linesPer);
    newPages = splitIntoLineBuckets(n, linesPer);
  } else {
    oldPages = [o];
    newPages = [n];
  }

  const usedFormFeedPageBoundaries = useFormFeed;
  const lineBucketPagination = !useFormFeed && linesPer > 0;
  const baselinePageCount = oldPages.length;
  const currentPageCount = newPages.length;
  const total = Math.max(oldPages.length, newPages.length);
  const totalStats: DiffStats = { added: 0, removed: 0, replaced: 0, unchanged: 0 };
  const pages: PageLineDiffPage[] = [];

  for (let i = 0; i < total; i++) {
    const { rows, stats } = buildSideBySideLineRows(oldPages[i] ?? "", newPages[i] ?? "", contextSize);
    totalStats.added += stats.added;
    totalStats.removed += stats.removed;
    totalStats.replaced += stats.replaced;
    totalStats.unchanged += stats.unchanged;
    const hasChanges =
      stats.added > 0 ||
      stats.removed > 0 ||
      stats.replaced > 0 ||
      rows.some((r) => r.kind === "pair" && Boolean(r.highlight));
    pages.push({ pageIndex: i, rows, stats, hasChanges });
  }

  return {
    pages,
    totalStats,
    usedFormFeedPageBoundaries,
    lineBucketPagination,
    linesPerLogicalPageWhenNoFormFeed: linesPer,
    baselinePageCount,
    currentPageCount,
  };
}

export type UnifiedLineType = "header" | "hunk" | "add" | "del" | "ctx";

export type UnifiedLine = { type: UnifiedLineType; text: string };

/** Toggles for Readable diff (side-by-side + unified): which change classes to show. */
export type DiffLineFilter = {
  showNewLine: boolean;
  showModifiedLine: boolean;
  showDeletedLine: boolean;
};

export const DEFAULT_DIFF_LINE_FILTER: DiffLineFilter = {
  showNewLine: true,
  showModifiedLine: true,
  showDeletedLine: true,
};

/** Side-by-side: hide change rows by highlight; context / collapse / message rows stay. */
export function filterSideBySideRows(rows: SideBySideRow[], filter: DiffLineFilter): SideBySideRow[] {
  return rows.filter((row) => {
    if (row.kind === "message" || row.kind === "collapse") return true;
    const h = row.highlight;
    if (h === undefined) return true;
    if (h === "block_insert") return filter.showNewLine;
    if (h === "block_delete") return filter.showDeletedLine;
    if (h === "block_replace" || h === "word_replace") return filter.showModifiedLine;
    return true;
  });
}

export type UnifiedLineCategory = "header" | "hunk" | "ctx" | "new" | "deleted" | "modified";

/** Classify unified patch lines: a run of `-` followed by a run of `+` is one logical modification. */
export function classifyUnifiedLineCategories(lines: UnifiedLine[]): UnifiedLineCategory[] {
  const c: UnifiedLineCategory[] = new Array(lines.length);
  let i = 0;
  while (i < lines.length) {
    const L = lines[i]!;
    if (L.type === "header") {
      c[i] = "header";
      i++;
      continue;
    }
    if (L.type === "hunk") {
      c[i] = "hunk";
      i++;
      continue;
    }
    if (L.type === "ctx") {
      c[i] = "ctx";
      i++;
      continue;
    }
    if (L.type === "del") {
      let j = i;
      while (j < lines.length && lines[j]!.type === "del") j++;
      const delEnd = j;
      while (j < lines.length && lines[j]!.type === "add") j++;
      const addEnd = j;
      if (delEnd > i && addEnd > delEnd) {
        for (let k = i; k < addEnd; k++) c[k] = "modified";
        i = addEnd;
        continue;
      }
      for (let k = i; k < delEnd; k++) c[k] = "deleted";
      i = delEnd;
      continue;
    }
    if (L.type === "add") {
      let j = i;
      while (j < lines.length && lines[j]!.type === "add") j++;
      for (let k = i; k < j; k++) c[k] = "new";
      i = j;
      continue;
    }
    c[i] = "ctx";
    i++;
  }
  return c;
}

export function filterUnifiedDiffLines(lines: UnifiedLine[], filter: DiffLineFilter): UnifiedLine[] {
  const cats = classifyUnifiedLineCategories(lines);
  return lines.filter((_, idx) => {
    const cat = cats[idx]!;
    if (cat === "header" || cat === "hunk" || cat === "ctx") return true;
    if (cat === "new") return filter.showNewLine;
    if (cat === "deleted") return filter.showDeletedLine;
    return filter.showModifiedLine;
  });
}

/** Git-style unified diff with context `n` lines (matches Python `difflib.unified_diff` style). */
export function buildUnifiedDiffLines(
  oldText: string,
  newText: string,
  n: number = 3,
): UnifiedLine[] {
  const patch = createTwoFilesPatch(
    "previous",
    "current",
    oldText ?? "",
    newText ?? "",
    "",
    "",
    { context: n },
  );
  const rawLines = patch.split("\n");
  const out: UnifiedLine[] = [];

  for (const line of rawLines) {
    if (!line) {
      out.push({ type: "ctx", text: "" });
      continue;
    }
    if (line.startsWith("Index:") || line.startsWith("===")) {
      out.push({ type: "header", text: line });
    } else if (line.startsWith("---") || line.startsWith("+++")) {
      out.push({ type: "header", text: line });
    } else if (line.startsWith("@@")) {
      out.push({ type: "hunk", text: line });
    } else if (line.startsWith("+")) {
      out.push({ type: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      out.push({ type: "del", text: line.slice(1) });
    } else if (line.startsWith("\\")) {
      out.push({ type: "ctx", text: line });
    } else {
      const c0 = line[0];
      out.push({ type: "ctx", text: c0 === " " ? line.slice(1) : line });
    }
  }
  return out;
}
