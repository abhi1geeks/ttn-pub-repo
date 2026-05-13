import type { DiffLineFilter, PageLineDiffPage, SideBySideRow, UnifiedLine, WordSpan } from "../lib/diff";
import { filterSideBySideRows } from "../lib/diff";
import { useEffect, useMemo, useState } from "react";

export type SideBySideVariant = "default" | "yellow-marker" | "semantic-lines";

function ParaNum({ n, prefix }: { n?: number; prefix?: string }) {
  if (n === undefined) return null;
  const p = prefix ?? "¶";
  return (
    <span className="mr-1.5 font-mono text-[10.5px] font-medium text-zinc-400">
      {p}
      {n}
    </span>
  );
}

function WordSpans({ spans, variant }: { spans: WordSpan[]; variant: SideBySideVariant }) {
  const isMarker = variant === "yellow-marker";
  const semantic = variant === "semantic-lines";
  return (
    <span className="whitespace-pre-wrap break-words">
      {spans.map((s, i) => (
        <span key={i}>
          {i > 0 ? " " : null}
          {s.type === "equal" ? (
            <span className="text-zinc-500">{s.text}</span>
          ) : isMarker ? (
            <mark className="rounded-sm bg-yellow-200/95 px-0.5 py-0.5 font-semibold text-zinc-900 decoration-clone [box-decoration-break:clone]">
              {s.text}
            </mark>
          ) : s.type === "delete" ? (
            <span
              className={
                semantic
                  ? "rounded bg-red-200/95 px-1 py-0.5 font-semibold text-red-950 line-through"
                  : "rounded bg-red-200 px-1 py-0.5 font-semibold text-red-900 line-through"
              }
            >
              {s.text}
            </span>
          ) : (
            <span
              className={
                semantic
                  ? "rounded bg-emerald-200/95 px-1 py-0.5 font-semibold text-emerald-950"
                  : "rounded bg-green-200 px-1 py-0.5 font-semibold text-green-900"
              }
            >
              {s.text}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}

const cellBase =
  "align-top border-b border-zinc-100 px-2.5 py-1.5 text-[13.5px] leading-[1.55] break-words whitespace-pre-wrap w-1/2";

export function DiffLineLegendFilter({
  value,
  onChange,
}: {
  value: DiffLineFilter;
  onChange: (next: DiffLineFilter) => void;
}) {
  const toggle = (key: keyof DiffLineFilter, checked: boolean) => {
    const next = { ...value, [key]: checked };
    if (!next.showNewLine && !next.showModifiedLine && !next.showDeletedLine) return;
    onChange(next);
  };

  const item = (
    key: keyof DiffLineFilter,
    label: string,
    swatch: string,
  ) => (
    <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-800">
      <input
        type="checkbox"
        className="accent-emerald-600"
        checked={value[key]}
        onChange={(e) => toggle(key, e.target.checked)}
      />
      <span className={swatch} />
      {label}
    </label>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Show in diff</div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {item("showNewLine", "New line", "inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-emerald-400 ring-1 ring-emerald-700/20")}
        {item(
          "showModifiedLine",
          "Modified line",
          "inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-amber-300 ring-1 ring-amber-600/30",
        )}
        {item("showDeletedLine", "Deleted line", "inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-red-400 ring-1 ring-red-800/20")}
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">
        Applies to <strong>Side-by-side</strong> and <strong>Unified</strong>. Context lines and collapse markers stay
        visible. Unified treats a block of <code className="rounded bg-white/80 px-1">−</code> lines followed by{" "}
        <code className="rounded bg-white/80 px-1">+</code> lines as one <strong>modified</strong> change.
      </p>
    </div>
  );
}

function renderCellContent(
  cell: {
    empty?: boolean;
    dim?: boolean;
    paraNum?: number;
    spans?: WordSpan[];
    plain?: string;
  },
  variant: SideBySideVariant,
  lineMode: boolean,
) {
  if (cell.empty) {
    return (
      <div
        className="min-h-[1.25rem]"
        style={{
          background:
            "repeating-linear-gradient(45deg,#fbfbfb,#fbfbfb 5px,#f4f4f4 5px,#f4f4f4 10px)",
        }}
      >
        &nbsp;
      </div>
    );
  }
  return (
    <>
      <ParaNum n={cell.paraNum} prefix={lineMode ? "L" : "¶"} />
      {cell.spans ? (
        <WordSpans spans={cell.spans} variant={variant} />
      ) : (
        <span className={cell.dim ? "text-zinc-400" : undefined}>{cell.plain ?? ""}</span>
      )}
    </>
  );
}

function pairRowStyles(
  h: "word_replace" | "block_delete" | "block_insert" | "block_replace" | undefined,
  variant: SideBySideVariant,
): { leftBorder: string; rightBorder: string; leftBg: string; rightBg: string } {
  if (variant === "semantic-lines") {
    if (h === "word_replace") {
      return {
        leftBorder: "border-l-[3px] border-l-amber-500",
        rightBorder: "border-l-[3px] border-l-amber-500",
        leftBg: "bg-amber-50/90",
        rightBg: "bg-amber-50/90",
      };
    }
    if (h === "block_replace") {
      return {
        leftBorder: "border-l-[3px] border-l-amber-500",
        rightBorder: "border-l-[3px] border-l-amber-500",
        leftBg: "bg-amber-50/90",
        rightBg: "bg-amber-50/90",
      };
    }
    if (h === "block_delete") {
      return {
        leftBorder: "border-l-[3px] border-l-red-600",
        rightBorder: "",
        leftBg: "bg-red-50/95",
        rightBg: "",
      };
    }
    if (h === "block_insert") {
      return {
        leftBorder: "",
        rightBorder: "border-l-[3px] border-l-emerald-600",
        leftBg: "",
        rightBg: "bg-emerald-50/95",
      };
    }
    return { leftBorder: "", rightBorder: "", leftBg: "", rightBg: "" };
  }

  const marker = variant === "yellow-marker";
  if (marker && h === "word_replace") {
    return {
      leftBorder: "border-l-[3px] border-l-amber-500",
      rightBorder: "border-l-[3px] border-l-amber-500",
      leftBg: "bg-yellow-50/80",
      rightBg: "bg-yellow-50/80",
    };
  }
  if (marker && (h === "block_delete" || h === "block_insert" || h === "block_replace")) {
    return {
      leftBorder: "border-l-[3px] border-l-amber-500",
      rightBorder: "border-l-[3px] border-l-amber-500",
      leftBg: h === "block_delete" || h === "block_replace" ? "bg-yellow-100/90" : "",
      rightBg: h === "block_insert" || h === "block_replace" ? "bg-yellow-100/90" : "",
    };
  }
  const leftBorder =
    h === "word_replace" || h === "block_delete" || h === "block_replace" ? "border-l-[3px] border-l-red-600" : "";
  const rightBorder =
    h === "word_replace" || h === "block_insert" || h === "block_replace" ? "border-l-[3px] border-l-green-600" : "";
  const leftBg = h === "block_delete" || h === "block_replace" ? "bg-red-50" : "";
  const rightBg = h === "block_insert" || h === "block_replace" ? "bg-green-50" : "";
  return { leftBorder, rightBorder, leftBg, rightBg };
}

export function SideBySideTable({
  rows,
  variant = "default",
  lineMode = false,
}: {
  rows: SideBySideRow[];
  variant?: SideBySideVariant;
  /** When true, column headers say "lines" and collapse rows use "lines" copy. */
  lineMode?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-md shadow-zinc-900/5 ring-1 ring-zinc-100">
      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr>
            <th className="w-1/2 border-b border-zinc-200 bg-zinc-50 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Baseline ingest{lineMode ? " (lines)" : ""}
            </th>
            <th className="w-1/2 border-b border-zinc-200 bg-emerald-50/60 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-emerald-900/70">
              Current ingest{lineMode ? " (lines)" : ""}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            if (row.kind === "message") {
              return (
                <tr key={idx}>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-zinc-600">
                    {row.text}
                  </td>
                </tr>
              );
            }
            if (row.kind === "collapse") {
              const n = row.hiddenParagraphs;
              const unit = row.segmentLabel === "line" ? "line" : "paragraph";
              const msg =
                unit === "line"
                  ? `… ${n} unchanged line${n === 1 ? "" : "s"} hidden …`
                  : `… ${n} unchanged paragraph${n === 1 ? "" : "s"} hidden …`;
              return (
                <tr key={idx}>
                  <td
                    colSpan={2}
                    className="border-b border-zinc-100 bg-zinc-50 py-1.5 text-center text-xs italic text-zinc-400"
                  >
                    {msg}
                  </td>
                </tr>
              );
            }
            const h = row.highlight;
            const { leftBorder, rightBorder, leftBg, rightBg } = pairRowStyles(h, variant);
            return (
              <tr key={idx}>
                <td className={`${cellBase} ${leftBorder} ${leftBg}`}>
                  {renderCellContent(row.left, variant, lineMode)}
                </td>
                <td className={`${cellBase} ${rightBorder} ${rightBg}`}>
                  {renderCellContent(row.right, variant, lineMode)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Readable diff → Side-by-side: page-wise line diff with pagination. */
export function PageWiseReadableDiff({
  pages,
  usedFormFeedPageBoundaries,
  lineBucketPagination,
  linesPerLogicalPageWhenNoFormFeed,
  baselinePdfPageCount,
  currentPdfPageCount,
  variant = "semantic-lines",
  baselinePageCount,
  currentPageCount,
  lineFilter,
}: {
  pages: PageLineDiffPage[];
  usedFormFeedPageBoundaries: boolean;
  lineBucketPagination: boolean;
  linesPerLogicalPageWhenNoFormFeed: number;
  baselinePdfPageCount?: number;
  currentPdfPageCount?: number;
  variant?: SideBySideVariant;
  baselinePageCount: number;
  currentPageCount: number;
  lineFilter: DiffLineFilter;
}) {
  const total = pages.length;
  const [active, setActive] = useState(0);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, total - 1)));
  }, [total]);

  const safeIndex = total === 0 ? 0 : Math.min(active, total - 1);
  const page = total > 0 ? pages[safeIndex] : undefined;
  const displayNum = total === 0 ? 0 : safeIndex + 1;

  const filteredRows = useMemo(
    () => filterSideBySideRows(page?.rows ?? [], lineFilter),
    [page, lineFilter],
  );

  const hasBaselinePage = safeIndex < baselinePageCount;
  const hasCurrentPage = safeIndex < currentPageCount;
  let mismatchNote: string | null = null;
  if (total > 0 && baselinePageCount !== currentPageCount) {
    if (!hasCurrentPage) {
      mismatchNote =
        "Current document has fewer pages: this logical page exists only on the baseline side (right column is empty).";
    } else if (!hasBaselinePage) {
      mismatchNote =
        "Baseline document has fewer pages: this logical page exists only on the current side (left column is empty).";
    }
  }

  const go = (next: number) => {
    const clamped = Math.max(0, Math.min(total - 1, next));
    setActive(clamped);
  };

  return (
    <div className="space-y-6">
      {variant === "semantic-lines" ? (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          Inside <strong>modified</strong> lines, removed words are red and new words are green.
        </p>
      ) : null}
      {usedFormFeedPageBoundaries ? (
        <p className="rounded-lg border border-sky-200/80 bg-sky-50/70 px-3 py-2 text-xs text-sky-950">
          <strong>Logical pages</strong> follow form-feed (<code className="rounded bg-white/80 px-1">\f</code>) markers
          in each ingest&apos;s <code className="rounded bg-white/80 px-1">fullText</code>.
        </p>
      ) : lineBucketPagination ? (
        <p className="rounded-lg border border-sky-200/80 bg-sky-50/70 px-3 py-2 text-xs text-sky-950">
          <strong>Logical pages</strong> split each side every{" "}
          <span className="font-semibold tabular-nums">{linesPerLogicalPageWhenNoFormFeed}</span> lines for navigation
          only — <strong>not</strong> true PDF page numbers unless your extractor inserts <code className="rounded bg-white/80 px-1">\f</code>{" "}
          between pages.
        </p>
      ) : (
        <div className="space-y-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950">
          <p>
            <strong>One logical page</strong> — <code className="rounded bg-white/80 px-1">fullText</code> has no form-feed (
            <code className="rounded bg-white/80 px-1">\f</code>) page breaks, so the whole run is shown as a single scroll.
          </p>
          <p className="text-[11px] leading-relaxed text-amber-900/95">
            <strong>Qdrant chunks</strong> for the same <code className="rounded bg-white/70 px-1">documentUrl</code> carry{" "}
            <code className="rounded bg-white/70 px-1">metadata.versionId</code> and{" "}
            <code className="rounded bg-white/70 px-1">metadata.chunkIndex</code> (chunk order). We do{" "}
            <strong>not</strong> store a PDF page number per chunk today. To align this UI with real pages, insert{" "}
            <code className="rounded bg-white/70 px-1">\f</code> when assembling <code className="rounded bg-white/70 px-1">fullText</code>{" "}
            in n8n (or stamp optional <code className="rounded bg-white/70 px-1">pdfPageCount</code> on the run and extend the UI later).
          </p>
        </div>
      )}

      {total === 0 ? (
        <p className="text-sm text-zinc-600">No pages to compare.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-zinc-800">
                Page <span className="tabular-nums">{displayNum}</span> of{" "}
                <span className="tabular-nums">{total}</span>
              </span>
              <span className="text-xs text-zinc-500">
                Baseline PDF pages: <span className="font-semibold text-zinc-700">{baselinePageCount}</span> · Current:{" "}
                <span className="font-semibold text-zinc-700">{currentPageCount}</span>
                {typeof baselinePdfPageCount === "number" || typeof currentPdfPageCount === "number" ? (
                  <span className="ml-2 text-[10px] text-zinc-400">
                    (run payload pdfPageCount: baseline {baselinePdfPageCount ?? "—"} · current {currentPdfPageCount ?? "—"}
                    )
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={safeIndex <= 0}
                onClick={() => go(safeIndex - 1)}
                className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safeIndex >= total - 1}
                onClick={() => go(safeIndex + 1)}
                className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          {total <= 20 ? (
            <div className="flex flex-wrap gap-1.5">
              {pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => go(i)}
                  className={`min-w-[2.25rem] rounded-lg px-2 py-1 text-xs font-medium tabular-nums ${
                    i === safeIndex
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          ) : null}

          {mismatchNote ? (
            <p className="rounded-lg border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-950">{mismatchNote}</p>
          ) : null}

          {page ? (
            <section className="scroll-mt-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-2">
                <h4 className="text-sm font-semibold text-zinc-900">Logical page {page.pageIndex + 1}</h4>
                {page.hasChanges ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 ring-1 ring-amber-300/60">
                    Changes on this page
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-zinc-400">No line-level changes</span>
                )}
              </div>
              <SideBySideTable rows={filteredRows} variant={variant} lineMode />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export function UnifiedDiffView({ lines }: { lines: UnifiedLine[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-zinc-50 p-2 font-mono text-[12.5px] leading-snug shadow-md shadow-zinc-900/5 ring-1 ring-zinc-100">
      {lines.map((line, i) => {
        if (line.type === "header") {
          return (
            <div key={i} className="px-1.5 py-0.5 font-bold text-zinc-500">
              {line.text}
            </div>
          );
        }
        if (line.type === "hunk") {
          return (
            <div key={i} className="bg-indigo-50 px-1.5 py-0.5 text-indigo-800">
              {line.text}
            </div>
          );
        }
        if (line.type === "add") {
          return (
            <div key={i} className="bg-green-100 px-1.5 py-0.5 text-green-900">
              +{line.text}
            </div>
          );
        }
        if (line.type === "del") {
          return (
            <div key={i} className="bg-red-100 px-1.5 py-0.5 text-red-900">
              -{line.text}
            </div>
          );
        }
        return (
          <div key={i} className="px-1.5 py-0.5 text-zinc-600">
            {line.text ? ` ${line.text}` : ""}
          </div>
        );
      })}
    </div>
  );
}
