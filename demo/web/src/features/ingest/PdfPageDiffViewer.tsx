import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  A4_WIDTH_PT,
  bboxToViewport,
  clampPdfScale,
  DEFAULT_REGION_KIND_FILTER,
  diffRegionsUrl,
  filterRegionsByKind,
  layoutUrlForRun,
  pdfUrlForRun,
  regionFill,
  regionStroke,
  regionsForPdfSide,
  scaleToFitPaneWidth,
  type ChangeRegion,
  type LayoutDocument,
  type PageLayout,
  type RegionKindFilter,
} from "../../lib/pdf_artifacts";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

function RegionOverlay({
  regions,
  pageSize,
  viewport,
}: {
  regions: ChangeRegion[];
  pageSize: { w: number; h: number };
  viewport: { w: number; h: number };
}) {
  if (!viewport.w || !viewport.h || !regions.length) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${viewport.w} ${viewport.h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {regions.map((r, i) => {
        const rect = bboxToViewport(r.bbox, pageSize.w, pageSize.h, viewport.w, viewport.h);
        if (!rect) return null;
        return (
          <rect
            key={`${r.kind}-${i}`}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            fill={regionFill(r.kind)}
            stroke={regionStroke(r.kind)}
            strokeWidth={1.5}
            rx={1}
          />
        );
      })}
    </svg>
  );
}

function PdfPane({
  label,
  documentUrl,
  versionId,
  pageNum,
  scale,
  layoutPage,
  regions,
  onPaneWidth,
}: {
  label: string;
  documentUrl: string;
  versionId: string;
  pageNum: number;
  scale: number;
  layoutPage: PageLayout | undefined;
  regions: ChangeRegion[];
  onPaneWidth?: (width: number) => void;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [pageSize, setPageSize] = useState({ w: A4_WIDTH_PT, h: 841.89 });

  useEffect(() => {
    const el = paneRef.current;
    if (!el || !onPaneWidth) return;
    const report = () => onPaneWidth(el.clientWidth);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onPaneWidth]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const canvas = canvasRef.current;
      if (!canvas || !versionId) return;
      const doc = await pdfjs.getDocument(pdfUrlForRun(documentUrl, versionId)).promise;
      const pdfPage = await doc.getPage(pageNum);
      const baseVp = pdfPage.getViewport({ scale: 1 });
      const vp = pdfPage.getViewport({ scale });
      canvas.width = vp.width;
      canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      await pdfPage.render({ canvasContext: ctx, viewport: vp }).promise;
      if (!cancelled) {
        setViewport({ w: vp.width, h: vp.height });
        setPageSize({
          w: layoutPage?.width ?? baseVp.width,
          h: layoutPage?.height ?? baseVp.height,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentUrl, versionId, pageNum, scale, layoutPage?.width, layoutPage?.height]);

  return (
    <div ref={paneRef} className="min-w-0 flex-1">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="w-full max-w-full overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-100">
        <div
          className="relative w-full max-w-full"
          style={viewport.w && viewport.h ? { aspectRatio: `${viewport.w} / ${viewport.h}` } : undefined}
        >
          <canvas ref={canvasRef} className="block h-full w-full" />
          <RegionOverlay regions={regions} pageSize={pageSize} viewport={viewport} />
        </div>
      </div>
      {layoutPage ? (
        <p className="mt-1 text-[10px] text-zinc-500">
          {layoutPage.spans.length} span(s)
          {regions.length ? ` · ${regions.length} highlight(s)` : ""}
        </p>
      ) : null}
    </div>
  );
}

async function fetchLayout(documentUrl: string, versionId: string): Promise<LayoutDocument | null> {
  const r = await fetch(layoutUrlForRun(documentUrl, versionId), { credentials: "same-origin" });
  if (!r.ok) return null;
  const data = (await r.json()) as { layout: LayoutDocument };
  return data.layout;
}

export function PdfPageDiffViewer({
  documentUrl,
  baselineVersionId,
  currentVersionId,
  changeRegions: changeRegionsProp,
  baselinePageCount = 1,
  currentPageCount = 1,
  initialPage,
}: {
  documentUrl: string;
  baselineVersionId: string;
  currentVersionId: string;
  changeRegions: ChangeRegion[];
  baselinePageCount?: number;
  currentPageCount?: number;
  /** 0-based page index; jumps when navigating from section-aligned diff */
  initialPage?: number;
}) {
  const totalPages = Math.max(baselinePageCount, currentPageCount, 1);
  const [page, setPage] = useState(() =>
    initialPage != null ? Math.min(Math.max(0, initialPage), totalPages - 1) : 0,
  );

  useEffect(() => {
    if (initialPage == null) return;
    setPage(Math.min(Math.max(0, initialPage), totalPages - 1));
  }, [initialPage, totalPages]);
  const [paneWidthPx, setPaneWidthPx] = useState(0);
  const reportPaneWidth = useCallback((w: number) => {
    setPaneWidthPx((prev) => (Math.abs(prev - w) < 2 ? prev : w));
  }, []);
  /** null = use auto fit-to-pane (A4 / layout width); number = user override from slider */
  const [userZoom, setUserZoom] = useState<number | null>(null);
  const [baselineLayout, setBaselineLayout] = useState<LayoutDocument | null>(null);
  const [currentLayout, setCurrentLayout] = useState<LayoutDocument | null>(null);
  const [regions, setRegions] = useState<ChangeRegion[]>(changeRegionsProp);
  const [regionsErr, setRegionsErr] = useState<string | null>(null);
  const [regionsSource, setRegionsSource] = useState<string | null>(null);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [layoutErr, setLayoutErr] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<RegionKindFilter>(DEFAULT_REGION_KIND_FILTER);

  const pageNum = page + 1;

  const toggleKindFilter = useCallback((key: keyof RegionKindFilter, checked: boolean) => {
    setKindFilter((prev) => {
      const next = { ...prev, [key]: checked };
      if (!next.delete && !next.insert && !next.replace) return prev;
      return next;
    });
  }, []);

  const filteredRegions = useMemo(
    () => filterRegionsByKind(regions, kindFilter),
    [regions, kindFilter],
  );

  const kindCounts = useMemo(() => {
    const c = { delete: 0, insert: 0, replace: 0 };
    for (const r of regions) {
      if (r.kind === "delete") c.delete += 1;
      else if (r.kind === "insert") c.insert += 1;
      else c.replace += 1;
    }
    return c;
  }, [regions]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setRegionsLoading(true);
      setRegionsErr(null);
      try {
        const r = await fetch(diffRegionsUrl(documentUrl, baselineVersionId, currentVersionId), {
          credentials: "same-origin",
        });
        if (cancelled) return;
        if (r.ok) {
          const data = (await r.json()) as { regions?: ChangeRegion[]; source?: string };
          if (data.regions?.length) {
            setRegions(data.regions);
            setRegionsSource(data.source ?? "api");
            return;
          }
          if (data.source === "computed-empty") {
            setRegions([]);
            setRegionsSource("computed-empty");
            return;
          }
        } else {
          const errBody = (await r.json().catch(() => ({}))) as { error?: string };
          if (errBody.error) setRegionsErr(errBody.error);
        }
        if (changeRegionsProp.length) {
          setRegions(changeRegionsProp);
          setRegionsSource("run-payload");
        }
      } catch (e) {
        if (!cancelled) setRegionsErr(e instanceof Error ? e.message : String(e));
        if (changeRegionsProp.length) {
          setRegions(changeRegionsProp);
          setRegionsSource("run-payload");
        }
      } finally {
        if (!cancelled) setRegionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [changeRegionsProp, documentUrl, baselineVersionId, currentVersionId]);

  const pagesWithChanges = useMemo(() => {
    const s = new Set(filteredRegions.map((r) => r.page));
    return [...s].sort((a, b) => a - b);
  }, [filteredRegions]);

  useEffect(() => {
    setPage((p) => Math.min(p, Math.max(0, totalPages - 1)));
  }, [totalPages]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLayoutErr(null);
      try {
        const [base, cur] = await Promise.all([
          fetchLayout(documentUrl, baselineVersionId),
          fetchLayout(documentUrl, currentVersionId),
        ]);
        if (!cancelled) {
          setBaselineLayout(base);
          setCurrentLayout(cur);
        }
      } catch (e) {
        if (!cancelled) setLayoutErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentUrl, baselineVersionId, currentVersionId]);

  const regionsOnPage = useMemo(
    () => filteredRegions.filter((r) => r.page === pageNum),
    [filteredRegions, pageNum],
  );
  const baselineRegions = useMemo(
    () => regionsForPdfSide(regionsOnPage, "baseline"),
    [regionsOnPage],
  );
  const currentRegions = useMemo(
    () => regionsForPdfSide(regionsOnPage, "current"),
    [regionsOnPage],
  );
  const baselinePage = baselineLayout?.pages?.find((p) => p.pageNumber === pageNum);
  const currentPage = currentLayout?.pages?.find((p) => p.pageNumber === pageNum);

  const pageWidthPt =
    Math.max(baselinePage?.width ?? 0, currentPage?.width ?? 0, A4_WIDTH_PT);
  const effectivePaneWidth = paneWidthPx > 0 ? paneWidthPx : 480;
  const fitScale = scaleToFitPaneWidth(effectivePaneWidth, pageWidthPt);

  const scale = userZoom ?? fitScale;

  return (
    <div className="min-w-0 space-y-4">
      <p className="rounded-lg border border-violet-200/80 bg-violet-50/70 px-3 py-2 text-xs text-violet-950">
        <strong>PDF view</strong> — highlighted regions from layout text diff (baseline vs current).
      </p>
      <div className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2.5">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Show highlights</div>
        <div className="flex flex-wrap gap-3 text-[11px]">
          {(
            [
              {
                key: "delete" as const,
                label: "Delete (baseline)",
                border: "border-red-200",
                bg: "bg-red-50",
                swatch: "border-red-700 bg-red-400/60",
              },
              {
                key: "insert" as const,
                label: "Insert (current)",
                border: "border-green-200",
                bg: "bg-green-50",
                swatch: "border-green-700 bg-green-400/60",
              },
              {
                key: "replace" as const,
                label: "Replace (both)",
                border: "border-amber-200",
                bg: "bg-amber-50",
                swatch: "border-amber-700 bg-amber-400/60",
              },
            ] as const
          ).map(({ key, label, border, bg, swatch }) => (
            <label
              key={key}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 transition-opacity ${border} ${bg} ${
                kindFilter[key] ? "text-zinc-800" : "text-zinc-500 opacity-45"
              }`}
            >
              <input
                type="checkbox"
                className="accent-violet-600"
                checked={kindFilter[key]}
                onChange={(e) => toggleKindFilter(key, e.target.checked)}
              />
              <span className={`h-2.5 w-2.5 rounded-sm border ${swatch}`} aria-hidden />
              {label}
              <span className="text-zinc-500">({kindCounts[key]})</span>
            </label>
          ))}
        </div>
      </div>
      {layoutErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{layoutErr}</p>
      ) : null}
      {regionsErr ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">{regionsErr}</p>
      ) : null}
      {regionsLoading ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">Loading change regions…</p>
      ) : null}
      {!regionsLoading && !regions.length ? (
        <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
          No layout diff regions for the selected baseline and current runs
          {regionsSource === "computed-empty"
            ? " (layouts match or text is identical on all pages)."
            : ". Ensure both ingests completed “HTTP: Process Ingest Artifacts” and pick the older run as baseline."}
        </p>
      ) : null}
      {!regionsLoading && regions.length ? (
        <p className="text-xs text-zinc-600">
          {filteredRegions.length} of {regions.length} region(s) shown
          {regionsSource ? ` · source: ${regionsSource}` : ""}
          {pagesWithChanges.length
            ? ` · pages with changes: ${pagesWithChanges.slice(0, 12).join(", ")}${pagesWithChanges.length > 12 ? "…" : ""}`
            : ""}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-sm text-zinc-700">
            Page {pageNum} of {totalPages}
            {regionsOnPage.length ? ` · ${regionsOnPage.length} change(s)` : ""}
          </span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            Next
          </button>
          {pagesWithChanges.length ? (
            <button
              type="button"
              onClick={() => {
                const next = pagesWithChanges.find((p) => p > pageNum) ?? pagesWithChanges[0];
                setPage(next - 1);
              }}
              className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-900"
            >
              Jump to change
            </button>
          ) : null}
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:max-w-md">
          <button
            type="button"
            onClick={() => setUserZoom(null)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              userZoom === null
                ? "border-violet-400 bg-violet-100 text-violet-950"
                : "border-zinc-300 bg-white text-zinc-700"
            }`}
            title="Fit each page to pane width (default for A4 side-by-side comparison)"
          >
            Fit page (A4)
          </button>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-zinc-600">
            <span className="shrink-0">Zoom {Math.round(scale * 100)}%</span>
            <input
              type="range"
              min={0.45}
              max={2.5}
              step={0.05}
              value={scale}
              className="min-w-0 flex-1"
              onChange={(e) => setUserZoom(clampPdfScale(Number(e.target.value)))}
            />
          </label>
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <PdfPane
          label="Baseline PDF"
          documentUrl={documentUrl}
          versionId={baselineVersionId}
          pageNum={pageNum}
          scale={scale}
          layoutPage={baselinePage}
          regions={baselineRegions}
          onPaneWidth={reportPaneWidth}
        />
        <PdfPane
          label="Current PDF"
          documentUrl={documentUrl}
          versionId={currentVersionId}
          pageNum={pageNum}
          scale={scale}
          layoutPage={currentPage}
          regions={currentRegions}
          onPaneWidth={reportPaneWidth}
        />
      </div>
    </div>
  );
}
