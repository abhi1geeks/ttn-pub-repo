import { useEffect, useMemo, useState } from "react";
import {
  alignedChangesUrl,
  DEFAULT_ALIGNED_KIND_FILTER,
  filterAlignedByKind,
  kindBadgeClass,
  kindLabel,
  pageRefLabel,
  type AlignedChange,
  type AlignedChangesSummary,
  type AlignedKindFilter,
} from "../../lib/section_align";

export function SectionAlignedDiff({
  documentUrl,
  baselineVersionId,
  currentVersionId,
  baselinePageCount,
  currentPageCount,
  onOpenPdfAtPage,
}: {
  documentUrl: string;
  baselineVersionId: string;
  currentVersionId: string;
  baselinePageCount?: number;
  currentPageCount?: number;
  onOpenPdfAtPage?: (page: number, side: "baseline" | "current") => void;
}) {
  const [changes, setChanges] = useState<AlignedChange[]>([]);
  const [summary, setSummary] = useState<AlignedChangesSummary | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<AlignedKindFilter>(DEFAULT_ALIGNED_KIND_FILTER);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(alignedChangesUrl(documentUrl, baselineVersionId, currentVersionId), {
          credentials: "same-origin",
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        const data = (await r.json()) as {
          alignedChanges?: AlignedChange[];
          summary?: AlignedChangesSummary;
          source?: string;
        };
        if (!cancelled) {
          setChanges(data.alignedChanges ?? []);
          setSummary(data.summary ?? null);
          setSource(data.source ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentUrl, baselineVersionId, currentVersionId]);

  const filtered = useMemo(() => {
    let list = filterAlignedByKind(changes, kindFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          (c.baselineExcerpt ?? "").toLowerCase().includes(q) ||
          (c.currentExcerpt ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [changes, kindFilter, query]);

  const toggleKind = (key: keyof AlignedKindFilter, checked: boolean) => {
    setKindFilter((prev) => {
      const next = { ...prev, [key]: checked };
      if (!next.inserted && !next.deleted && !next.modified && !next.moved) return prev;
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-3 py-2 text-xs text-indigo-950">
        <strong>By section</strong> — paragraphs matched across the full document (handles different page counts
        and content that moved between pages). Baseline {baselinePageCount ?? "?"} pp · Current{" "}
        {currentPageCount ?? "?"} pp.
      </p>

      {summary ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["moved", "Moved"],
              ["modified", "Modified"],
              ["deleted", "Deleted"],
              ["inserted", "Inserted"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center">
              <p className="text-lg font-semibold text-zinc-900">{summary[key]}</p>
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filter by change type</div>
        <div className="flex flex-wrap gap-3 text-[11px]">
          {(["moved", "modified", "deleted", "inserted"] as const).map((key) => (
            <label
              key={key}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 ${kindBadgeClass(key)} ${
                kindFilter[key] ? "" : "opacity-45"
              }`}
            >
              <input
                type="checkbox"
                className="accent-violet-600"
                checked={kindFilter[key]}
                onChange={(e) => toggleKind(key, e.target.checked)}
              />
              {kindLabel(key)}
              {summary ? <span className="opacity-70">({summary[key]})</span> : null}
            </label>
          ))}
        </div>
        <label className="mt-1 block text-xs text-zinc-600">
          Search excerpts
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by text…"
            className="mt-1 w-full max-w-md rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-600">Loading aligned sections…</p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{error}</p>
      ) : null}
      {!loading && !error && !changes.length ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          No section-level changes detected. Re-ingest both versions with layout extraction enabled, or documents may
          be identical at paragraph level.
        </p>
      ) : null}

      {!loading && !error && changes.length ? (
        <p className="text-xs text-zinc-500">
          Showing {filtered.length} of {changes.length} section change(s)
          {source ? ` · source: ${source}` : ""}
        </p>
      ) : null}

      <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
        {filtered.map((ch, i) => (
          <li
            key={`${ch.kind}-${ch.baselineBlockId ?? ""}-${ch.currentBlockId ?? ""}-${i}`}
            className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${kindBadgeClass(ch.kind)}`}>
                {kindLabel(ch.kind)}
              </span>
              <span className="font-mono text-[11px] text-zinc-500">{pageRefLabel(ch)}</span>
              {ch.similarity > 0 && ch.kind !== "inserted" && ch.kind !== "deleted" ? (
                <span className="text-[10px] text-zinc-400">{Math.round(ch.similarity * 100)}% similar</span>
              ) : null}
            </div>
            {ch.kind === "moved" || ch.kind === "modified" ? (
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                {ch.baselineExcerpt ? (
                  <div>
                    <p className="mb-0.5 font-medium text-zinc-500">Baseline</p>
                    <p className="leading-relaxed text-zinc-800">{ch.baselineExcerpt}</p>
                  </div>
                ) : null}
                {ch.currentExcerpt ? (
                  <div>
                    <p className="mb-0.5 font-medium text-zinc-500">Current</p>
                    <p className="leading-relaxed text-zinc-800">{ch.currentExcerpt}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-zinc-800">
                {ch.currentExcerpt || ch.baselineExcerpt || "—"}
              </p>
            )}
            {onOpenPdfAtPage ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {ch.baselinePage != null ? (
                  <button
                    type="button"
                    className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-700 hover:bg-zinc-100"
                    onClick={() => onOpenPdfAtPage(ch.baselinePage!, "baseline")}
                  >
                    PDF baseline p.{ch.baselinePage}
                  </button>
                ) : null}
                {ch.currentPage != null ? (
                  <button
                    type="button"
                    className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 text-[10px] font-medium text-zinc-700 hover:bg-zinc-100"
                    onClick={() => onOpenPdfAtPage(ch.currentPage!, "current")}
                  >
                    PDF current p.{ch.currentPage}
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
