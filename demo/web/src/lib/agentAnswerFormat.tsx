import { type ReactNode } from "react";

/** Inline patterns produced by the agents API / LLM (markdown-ish, chunk refs). */
const INLINE_RE = /\*\*(.+?)\*\*|\[chunk:\s*(\d+)\s*\]/gi;

export function parseInlineAgentText(s: string, onChunkClick?: (chunkIndex: number) => void): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = new RegExp(INLINE_RE.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      parts.push(s.slice(last, m.index));
    }
    if (m[1] != null && m[1] !== "") {
      const k = parts.length;
      parts.push(
        <strong key={`b-${k}`} className="font-semibold text-zinc-900">
          {m[1]}
        </strong>,
      );
    }
    if (m[2] != null) {
      const k = parts.length;
      const idx = Number(m[2]);
      if (onChunkClick && Number.isFinite(idx)) {
        parts.push(
          <button
            key={`c-${k}`}
            type="button"
            className="mx-0.5 inline-block align-baseline rounded-md bg-emerald-100 px-1.5 py-px font-mono text-[10px] font-medium tabular-nums text-emerald-900 underline decoration-emerald-400/80 hover:bg-emerald-200/80"
            title={`Open chunk ${idx} in Live index`}
            onClick={() => onChunkClick(idx)}
          >
            chunk {m[2]}
          </button>,
        );
      } else {
        parts.push(
          <span
            key={`c-${k}`}
            className="mx-0.5 inline-block align-baseline rounded-md bg-zinc-200/90 px-1.5 py-px font-mono text-[10px] font-medium tabular-nums text-zinc-700"
            title={`Citation chunk ${m[2]}`}
          >
            chunk {m[2]}
          </span>,
        );
      }
    }
    last = re.lastIndex;
  }
  if (last < s.length) {
    parts.push(s.slice(last));
  }
  return parts.length > 0 ? parts : [s];
}

/**
 * Turn markdown-like answer text into paragraphs and bullet lists for the chat UI.
 * Consecutive `- ` / `* ` lines become a single list; other non-empty lines become paragraphs.
 */
export function structureAgentAnswer(text: string, onChunkClick?: (chunkIndex: number) => void): ReactNode {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  const listBuf: string[] = [];
  let blockKey = 0;

  const flushList = () => {
    if (listBuf.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${blockKey++}`}
        className="list-outside list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-zinc-800 marker:text-emerald-600"
      >
        {listBuf.map((item, idx) => (
          <li key={idx} className="pl-0.5">
            {parseInlineAgentText(item, onChunkClick)}
          </li>
        ))}
      </ul>,
    );
    listBuf.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();
    const listMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch && listMatch[1] !== undefined) {
      listBuf.push(listMatch[1]);
    } else {
      flushList();
      if (trimmed.length > 0) {
        blocks.push(
          <p key={`p-${blockKey++}`} className="text-[13px] leading-relaxed text-zinc-800">
            {parseInlineAgentText(line, onChunkClick)}
          </p>,
        );
      }
    }
  }
  flushList();

  return <div className="space-y-3">{blocks}</div>;
}
