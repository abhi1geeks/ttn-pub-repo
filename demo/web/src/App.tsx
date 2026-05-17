import * as Tabs from "@radix-ui/react-tabs";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertScoringBand,
  AutomatedChangeDetectionStrip,
  IngestCadenceCallout,
  RunEvidenceExportButton,
} from "./components/uc1/GliCsvExtensions";
import { AssistantChatDock } from "./components/AssistantChatDock";
import { GliIntelligenceHub } from "./components/GliIntelligenceHub";
import { LoginGate } from "./components/LoginGate";
import { PageWiseReadableDiff, UnifiedDiffView, DiffLineLegendFilter } from "./components/DiffViews";
import { PdfPageDiffViewer } from "./features/ingest/PdfPageDiffViewer";
import { SectionAlignedDiff } from "./features/ingest/SectionAlignedDiff";
import { type ChangeRegion, type PdfArtifact } from "./lib/pdf_artifacts";
import {
  HitlReviewBar,
  ImpactSummaryCard,
  RunDigestGrid,
  SourceIdentityCard,
  selectClass,
  type HitlStatus,
} from "./components/uc1/Uc1Panels";
import { VersionHistoryPanel } from "./components/uc1/VersionHistoryPanel";
import {
  buildPageWiseLineDiff,
  buildUnifiedDiffLines,
  DEFAULT_DIFF_LINE_FILTER,
  filterUnifiedDiffLines,
  type DiffLineFilter,
} from "./lib/diff";
import { fmtTs } from "./lib/format";
import { hitlStorageKey, clampHitlReason, parseHitlReview, type HitlReviewPayload } from "./lib/uc1";
import { runToEvidenceSlice } from "./lib/run_evidence_export";
import { CUSTOM_SOURCES_CHANGED, customSourceDocumentUrls } from "./lib/custom_sources";
import { CATALOG_DOCUMENT_URLS, DEMO_CANONICAL_PDF } from "./data/sources_catalog";
import { documentUrlsMatch, expandDocumentUrlAliases, normalizeDocumentUrl } from "./lib/document_url";
import { requestCrossPrefillFromIngest } from "./lib/cross_prefill";
import { saveGapPrefillRegulatoryText } from "./lib/gap_prefill";
import {
  clearIngestFeatureFocus,
  INGEST_FEATURE_SECTION_ID,
  loadIngestFeatureFocus,
  saveIngestFeatureFocus,
  type IngestFeatureFocusId,
} from "./lib/ingest_feature_focus";
import {
  loadPersistedAppSurface,
  loadPersistedDocumentUrl,
  savePersistedAppSurface,
  savePersistedDocumentUrl,
  type AppSurface,
} from "./lib/workspace_persist";
import {
  readAppRouteFromLocation,
  subscribeAppRoute,
  writeAppRouteToLocation,
  type IngestTabId,
} from "./lib/app_route";
import { NAVIGATE_TO_CHUNK_EVENT, chunkElementId, highlightChunkElement } from "./lib/chunk_navigation";
import { buildSourceHealthFromRuns } from "./lib/source_health";
import { AppShell } from "./components/app/AppShell";
import { IngestContextBar } from "./features/ingest/IngestContextBar";
import { IngestWorkspace } from "./features/ingest/IngestWorkspace";

type ImpactOutputLang = "en" | "es" | "de" | "fr";

type Run = {
  documentUrl?: string;
  timestamp?: string;
  versionId?: string;
  documentHash?: string;
  runPointId?: string;
  llmSummary?: string;
  materialityNotes?: string;
  materialityScore?: number;
  agentsModelId?: string;
  summary?: {
    totalChunks?: number;
    newChunks?: number;
    removedChunks?: number;
    unchangedChunks?: number;
  };
  fullText?: string;
  /** When the ingest pipeline stamps it (optional); not the same as logical diff pages. */
  pdfPageCount?: number;
  pdfPageCountSource?: string;
  pdfArtifact?: PdfArtifact;
  layoutArtifact?: { path: string; pageCount?: number };
  changeRegions?: ChangeRegion[];
  diffBaselineVersionId?: string;
  urlHash?: string;
  /** XC-004: last HTTP fetch + headers snapshot at ingest (from n8n). */
  sourceIngest?: {
    httpStatus?: number | null;
    fetchedAt?: string | null;
    etag?: string | null;
    lastModified?: string | null;
    contentLength?: string | null;
    bytes?: number | null;
    productLine?: string | null;
    jurisdiction?: string | null;
    effectiveDate?: string | null;
    error?: string | null;
  };
  hitlReview?: HitlReviewPayload;
  added?: { chunkIndex?: number; chunkText?: string }[];
  removed?: { chunkIndex?: number; chunkText?: string; previousVersionId?: string }[];
};

type ImpactSessionOverride = {
  llmSummary: string;
  materialityNotes: string;
  materialityScore?: number | null;
  agentsModelId?: string;
  stub?: boolean;
};

type QdrantPoint = {
  id?: unknown;
  payload?: {
    metadata?: {
      documentUrl?: string;
      chunkIndex?: number;
      versionId?: string;
      documentHash?: string;
      productLine?: string;
      jurisdiction?: string;
      effectiveDate?: string;
      pdfPageCount?: number;
      chunkPageStart?: number;
      chunkPageEnd?: number;
      ingestFetchedAt?: string;
      ingestHttpStatus?: number;
    };
    content?: string;
  };
};

type AuthPhase = "loading" | "open" | "need_login" | "authed";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, credentials: init?.credentials ?? "same-origin" });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || r.statusText);
  }
  return (await r.json()) as T;
}

function labelForRun(r: Run): string {
  const s = r.summary ?? {};
  const ts = fmtTs(String(r.timestamp ?? ""));
  return `${ts}   (+${s.newChunks ?? 0} / -${s.removedChunks ?? 0})`;
}

function currentRunStorageKey(run: Run | undefined): string {
  if (!run) return "";
  return String(run.versionId ?? run.timestamp ?? "");
}

export default function App() {
  const initialRoute = typeof window !== "undefined" ? readAppRouteFromLocation() : null;
  const [tab, setTab] = useState<IngestTabId>(() => initialRoute?.tab ?? "doc");
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const [selectedUrl, setSelectedUrl] = useState<string>(
    () => initialRoute?.documentUrl || loadPersistedDocumentUrl() || "",
  );
  const [appSurface, setAppSurface] = useState<AppSurface>(
    () => initialRoute?.surface ?? loadPersistedAppSurface() ?? "gli_hub",
  );
  const [currentIdx, setCurrentIdx] = useState(0);
  const [baselineIdx, setBaselineIdx] = useState(1);

  const [viewMode, setViewMode] = useState<"side" | "unified">("side");
  const [diffPresentation, setDiffPresentation] = useState<"text" | "pdf" | "section">("text");
  const [pdfInitialPage, setPdfInitialPage] = useState<number | undefined>(undefined);
  const [contextSize, setContextSize] = useState(2);
  const [diffLineFilter, setDiffLineFilter] = useState<DiffLineFilter>(DEFAULT_DIFF_LINE_FILTER);
  /** When fullText has no \\f, split each side into this many lines per “logical page” (0 = off). */
  const [diffLinesPerLogicalPage, setDiffLinesPerLogicalPage] = useState(0);

  const [chunks, setChunks] = useState<QdrantPoint[] | null>(null);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const [loadingChunks, setLoadingChunks] = useState(false);

  const [hitlStatus, setHitlStatus] = useState<HitlStatus>("none");
  const [hitlReason, setHitlReason] = useState("");
  const [hitlSaving, setHitlSaving] = useState(false);
  const [hitlPersistError, setHitlPersistError] = useState<string | null>(null);

  const [bffAgentsProxy, setBffAgentsProxy] = useState(false);
  const [authPhase, setAuthPhase] = useState<AuthPhase>("loading");
  const [sessionUser, setSessionUser] = useState<string | null>(null);
  const [impactSessionByVersion, setImpactSessionByVersion] = useState<Record<string, ImpactSessionOverride>>({});
  const [impactGenerating, setImpactGenerating] = useState(false);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [impactOutputLang, setImpactOutputLang] = useState<ImpactOutputLang>("en");
  const [customSourcesRev, setCustomSourcesRev] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const h = await fetchJson<{ agentsProxy?: boolean; authRequired?: boolean }>("/api/health");
        setBffAgentsProxy(Boolean(h.agentsProxy));
        if (!h.authRequired) {
          setAuthPhase("open");
          return;
        }
        const me = await fetchJson<{ user: string | null }>("/api/auth/me");
        setSessionUser(me.user);
        setAuthPhase(me.user ? "authed" : "need_login");
      } catch {
        setBffAgentsProxy(false);
        setAuthPhase("open");
      }
    })();
  }, []);

  const loadRuns = useCallback(async () => {
    setLoadingRuns(true);
    setRunsError(null);
    try {
      const data = await fetchJson<{ runs: Run[] }>("/api/runs");
      setRuns(data.runs);
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : String(e));
      setRuns(null);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    if (authPhase !== "open" && authPhase !== "authed") return;
    void loadRuns();
  }, [authPhase, loadRuns]);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* ignore */
    }
    setSessionUser(null);
    setAuthPhase("need_login");
    setRuns(null);
    setRunsError(null);
    setLoadingRuns(false);
  }, []);

  useEffect(() => {
    const onCustomSources = () => setCustomSourcesRev((n) => n + 1);
    window.addEventListener(CUSTOM_SOURCES_CHANGED, onCustomSources);
    return () => window.removeEventListener(CUSTOM_SOURCES_CHANGED, onCustomSources);
  }, []);

  const docUrls = useMemo(() => {
    const s = new Set<string>();
    for (const u of CATALOG_DOCUMENT_URLS) {
      for (const alias of expandDocumentUrlAliases(u)) s.add(alias);
    }
    for (const u of customSourceDocumentUrls()) s.add(u);
    for (const r of runs ?? []) {
      const u = r.documentUrl;
      if (u) {
        s.add(u);
        for (const alias of expandDocumentUrlAliases(u)) s.add(alias);
      }
    }
    // Prefer the n8n-aligned canonical URL in the picker when both alias forms exist.
    const canonical = normalizeDocumentUrl(DEMO_CANONICAL_PDF);
    const list = [...s].sort();
    if (list.some((u) => normalizeDocumentUrl(u) === canonical)) {
      const rest = list.filter((u) => normalizeDocumentUrl(u) !== canonical);
      return [DEMO_CANONICAL_PDF, ...rest.filter((u) => u !== DEMO_CANONICAL_PDF)];
    }
    return list;
  }, [runs, customSourcesRev]);

  useEffect(() => {
    if (!docUrls.length) return;
    if (selectedUrl && docUrls.some((u) => documentUrlsMatch(u, selectedUrl))) return;
    const persisted = loadPersistedDocumentUrl();
    const preferred =
      (persisted && docUrls.find((u) => documentUrlsMatch(u, persisted))) ||
      docUrls.find((u) => documentUrlsMatch(u, DEMO_CANONICAL_PDF)) ||
      docUrls[0]!;
    setSelectedUrl(preferred);
  }, [docUrls, selectedUrl]);

  useEffect(() => {
    if (selectedUrl) savePersistedDocumentUrl(selectedUrl);
  }, [selectedUrl]);

  useEffect(() => {
    savePersistedAppSurface(appSurface);
  }, [appSurface]);

  useEffect(() => {
    writeAppRouteToLocation(
      { surface: appSurface, documentUrl: selectedUrl, tab, focus: null },
      true,
    );
  }, [appSurface, selectedUrl, tab]);

  useEffect(() => subscribeAppRoute(() => {
    const route = readAppRouteFromLocation();
    setAppSurface(route.surface);
    if (route.documentUrl) setSelectedUrl(route.documentUrl);
    setTab(route.tab);
  }), []);

  const navigateToChunk = useCallback((chunkIndex: number) => {
    setTab("now");
    window.setTimeout(() => highlightChunkElement(chunkIndex), 120);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ chunkIndex: number }>).detail;
      if (detail?.chunkIndex != null) navigateToChunk(detail.chunkIndex);
    };
    window.addEventListener(NAVIGATE_TO_CHUNK_EVENT, handler);
    return () => window.removeEventListener(NAVIGATE_TO_CHUNK_EVENT, handler);
  }, [navigateToChunk]);

  const runsForDoc = useMemo(() => {
    if (!runs || !selectedUrl) return [];
    return runs.filter((r) => r.documentUrl && documentUrlsMatch(r.documentUrl, selectedUrl));
  }, [runs, selectedUrl]);

  useEffect(() => {
    if (currentIdx >= runsForDoc.length) setCurrentIdx(0);
    const def = runsForDoc.length >= 2 ? 1 : 0;
    if (baselineIdx >= runsForDoc.length) setBaselineIdx(def);
  }, [runsForDoc.length, currentIdx, baselineIdx]);

  const currentRun = runsForDoc[currentIdx];
  const baselineRun =
    baselineIdx !== currentIdx && runsForDoc.length ? runsForDoc[baselineIdx] : undefined;

  const canShowPdfDiff = Boolean(
    baselineRun?.pdfArtifact?.path &&
      currentRun?.pdfArtifact?.path &&
      baselineRun.versionId &&
      currentRun.versionId,
  );

  const canShowSectionAlign = Boolean(
    (baselineRun?.layoutArtifact?.path || baselineRun?.pdfArtifact?.path) &&
      (currentRun?.layoutArtifact?.path || currentRun?.pdfArtifact?.path) &&
      baselineRun?.versionId &&
      currentRun?.versionId,
  );

  const pdfChangeRegions = useMemo((): ChangeRegion[] => {
    if (!currentRun?.changeRegions?.length) return [];
    return currentRun.changeRegions;
  }, [currentRun?.changeRegions]);

  const hitlKey = useMemo(() => {
    if (!selectedUrl || !currentRun) return null;
    return hitlStorageKey(selectedUrl, currentRunStorageKey(currentRun));
  }, [selectedUrl, currentRun]);

  useEffect(() => {
    if (!hitlKey || !currentRun) {
      setHitlStatus("none");
      setHitlReason("");
      return;
    }
    const parsed = parseHitlReview(currentRun.hitlReview);
    if (parsed) {
      setHitlStatus(parsed.status);
      setHitlReason(parsed.reason ?? "");
      return;
    }
    try {
      const v = sessionStorage.getItem(hitlKey);
      if (v === "acknowledged" || v === "flagged") {
        setHitlStatus(v);
        setHitlReason("");
      } else {
        setHitlStatus("none");
        setHitlReason("");
      }
    } catch {
      setHitlStatus("none");
      setHitlReason("");
    }
  }, [hitlKey, currentRun]);

  const persistHitl = useCallback(
    async (next: HitlStatus) => {
      setHitlPersistError(null);
      if (!hitlKey || !currentRun) return;
      const runPointId = currentRun.runPointId;
      const note = clampHitlReason(hitlReason);

      if (!runPointId) {
        try {
          if (next === "none") sessionStorage.removeItem(hitlKey);
          else sessionStorage.setItem(hitlKey, next);
        } catch {
          /* ignore */
        }
        setHitlStatus(next);
        if (next === "none") setHitlReason("");
        return;
      }

      setHitlSaving(true);
      try {
        const r = await fetch("/api/runs/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runPointId,
            status: next,
            reason: next === "none" ? "" : note,
          }),
        });
        let data: { error?: string; hitlReview?: HitlReviewPayload | null } = {};
        try {
          data = (await r.json()) as typeof data;
        } catch {
          data = {};
        }
        if (!r.ok) {
          setHitlPersistError(typeof data.error === "string" ? data.error : r.statusText || "Save failed");
          return;
        }
        try {
          sessionStorage.removeItem(hitlKey);
        } catch {
          /* ignore */
        }
        setHitlStatus(next);
        if (next === "none") setHitlReason("");
        const returned = data.hitlReview;
        setRuns((prev) => {
          if (!prev) return prev;
          return prev.map((row) => {
            if (String(row.runPointId ?? "") !== runPointId) return row;
            if (next === "none" || returned == null) {
              const { hitlReview: _drop, ...rest } = row;
              return rest as Run;
            }
            return { ...row, hitlReview: returned };
          });
        });
      } finally {
        setHitlSaving(false);
      }
    },
    [hitlKey, currentRun, hitlReason],
  );

  useEffect(() => {
    if (tab !== "now" || !selectedUrl) return;
    let cancelled = false;
    setLoadingChunks(true);
    setChunksError(null);
    void (async () => {
      try {
        const data = await fetchJson<{ points: QdrantPoint[] }>(
          `/api/chunks?documentUrl=${encodeURIComponent(selectedUrl)}`,
        );
        if (!cancelled) setChunks(data.points);
      } catch (e) {
        if (!cancelled) {
          setChunksError(e instanceof Error ? e.message : String(e));
          setChunks(null);
        }
      } finally {
        if (!cancelled) setLoadingChunks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, selectedUrl]);

  const fullTextHasFormFeed = useMemo(() => {
    const o = String(baselineRun?.fullText ?? "");
    const n = String(currentRun?.fullText ?? "");
    return o.includes("\f") || n.includes("\f");
  }, [baselineRun, currentRun]);

  const pageWiseLineDiff = useMemo(() => {
    if (!baselineRun || !currentRun) return null;
    const oldText = String(baselineRun.fullText ?? "");
    const newText = String(currentRun.fullText ?? "");
    return buildPageWiseLineDiff(oldText, newText, contextSize, {
      linesPerLogicalPageWhenNoFormFeed: fullTextHasFormFeed ? 0 : diffLinesPerLogicalPage,
    });
  }, [baselineRun, currentRun, contextSize, fullTextHasFormFeed, diffLinesPerLogicalPage]);

  const unifiedLines = useMemo(() => {
    if (!baselineRun || !currentRun) return null;
    return buildUnifiedDiffLines(String(baselineRun.fullText ?? ""), String(currentRun.fullText ?? ""), 3);
  }, [baselineRun, currentRun]);

  const unifiedLinesFiltered = useMemo(() => {
    if (!unifiedLines) return null;
    return filterUnifiedDiffLines(unifiedLines, diffLineFilter);
  }, [unifiedLines, diffLineFilter]);

  /** Same bodies as Readable diff / side-by-side — sent to Agents as compare_context when long enough. */
  const ingestCompareBaselineText = baselineRun ? String(baselineRun.fullText ?? "") : "";
  const ingestCompareCurrentText = currentRun ? String(currentRun.fullText ?? "") : "";

  /** Added/removed chunk excerpts from the current ingest run (Embedding delta); sent with compare_context for compare intent. */
  const ingestCompareChunkChanges = useMemo(() => {
    if (!currentRun) return [];
    type Row = { kind: "added" | "removed"; chunk_index: number | null; excerpt: string };
    const rows: Row[] = [];
    const maxExcerpt = 4000;
    const maxRows = 48;
    const push = (kind: Row["kind"], chunkIndex: unknown, text: unknown) => {
      if (rows.length >= maxRows) return;
      const excerpt = String(text ?? "").slice(0, maxExcerpt).trim();
      if (!excerpt) return;
      let ci: number | null = null;
      if (typeof chunkIndex === "number" && !Number.isNaN(chunkIndex)) ci = chunkIndex;
      else if (typeof chunkIndex === "string" && chunkIndex.trim() !== "" && !Number.isNaN(Number(chunkIndex))) {
        ci = Number(chunkIndex);
      }
      rows.push({ kind, chunk_index: ci, excerpt });
    };
    for (const a of currentRun.added ?? []) {
      push("added", a.chunkIndex, a.chunkText);
    }
    for (const r of currentRun.removed ?? []) {
      push("removed", r.chunkIndex, r.chunkText);
    }
    return rows;
  }, [currentRun]);

  const liveChunks = useMemo(() => {
    if (!chunks) return [];
    return [...chunks].sort(
      (a, b) =>
        (a.payload?.metadata?.chunkIndex ?? 0) - (b.payload?.metadata?.chunkIndex ?? 0),
    );
  }, [chunks]);

  const versionColors = useMemo(() => {
    const versions = new Set<string>();
    for (const p of liveChunks) {
      const v = p.payload?.metadata?.versionId;
      if (v) versions.add(String(v));
    }
    const palette = ["#ecfdf5", "#fff7d6", "#ffe7c2", "#e0f0ff", "#d9f5d9", "#f5d9f0"];
    const map = new Map<string, string>();
    [...versions].sort().forEach((v, i) => {
      map.set(v, palette[i % palette.length]!);
    });
    return map;
  }, [liveChunks]);

  const impactVersionKey = currentRun ? currentRunStorageKey(currentRun) : "";
  const impactSessionStorageKey =
    impactVersionKey && impactOutputLang ? `${impactVersionKey}::${impactOutputLang}` : "";
  const impactSession = impactSessionStorageKey ? impactSessionByVersion[impactSessionStorageKey] : undefined;

  const impactExecutive = impactSession?.llmSummary ?? currentRun?.llmSummary;
  const impactMateriality = impactSession?.materialityNotes ?? currentRun?.materialityNotes;
  const impactScore = impactSession?.materialityScore ?? currentRun?.materialityScore;
  const impactStubBadge = impactSession?.stub === true;
  const impactModelId = impactSession?.agentsModelId ?? currentRun?.agentsModelId;
  const impactPersistenceMode: "run" | "session" | "none" = impactSession
    ? "session"
    : currentRun?.llmSummary?.trim()
      ? "run"
      : "none";

  const sourceHealth = useMemo(() => buildSourceHealthFromRuns(runsForDoc), [runsForDoc]);

  const alertAutoTriageKey = useMemo(() => {
    if (!bffAgentsProxy || !impactVersionKey) return null;
    const exec = impactExecutive?.trim();
    const notes = impactMateriality?.trim();
    if (!exec && impactScore == null && !notes) return null;
    return impactSessionStorageKey || `${impactVersionKey}::stored`;
  }, [
    bffAgentsProxy,
    impactVersionKey,
    impactSessionStorageKey,
    impactExecutive,
    impactMateriality,
    impactScore,
  ]);

  useEffect(() => {
    setImpactError(null);
  }, [impactVersionKey, impactOutputLang]);

  useEffect(() => {
    if (appSurface !== "ingest_workspace") return;
    const focus = loadIngestFeatureFocus();
    if (!focus) return;
    const sectionId = INGEST_FEATURE_SECTION_ID[focus];
    const t = window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
      clearIngestFeatureFocus();
    }, 150);
    return () => window.clearTimeout(t);
  }, [appSurface, selectedUrl, runsForDoc.length]);

  const generateImpactSummary = useCallback(async () => {
    if (!currentRun?.documentUrl || !bffAgentsProxy) return;
    const key = currentRunStorageKey(currentRun);
    if (!key) return;
    const sessionKey = `${key}::${impactOutputLang}`;
    const runPointId = currentRun.runPointId;
    if (!runPointId) {
      setImpactError(
        "Missing runPointId on this run. Restart the web dev server so GET /api/runs attaches Qdrant point ids.",
      );
      return;
    }
    setImpactGenerating(true);
    setImpactError(null);
    try {
      const body = {
        run_point_id: runPointId,
        document_url: currentRun.documentUrl,
        version_id: key,
        document_hash: currentRun.documentHash ?? null,
        summary: {
          totalChunks: currentRun.summary?.totalChunks ?? 0,
          newChunks: currentRun.summary?.newChunks ?? 0,
          removedChunks: currentRun.summary?.removedChunks ?? 0,
          unchangedChunks: currentRun.summary?.unchangedChunks ?? 0,
        },
        added_preview: (currentRun.added ?? [])
          .slice(0, 5)
          .map((a) => String(a.chunkText ?? ""))
          .filter(Boolean),
        removed_preview: (currentRun.removed ?? [])
          .slice(0, 5)
          .map((r) => String(r.chunkText ?? ""))
          .filter(Boolean),
        target_language: impactOutputLang,
      };
      const r = await fetch("/api/agents/v1/agents/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (!r.ok) throw new Error(text.slice(0, 500) || r.statusText);
      const data = JSON.parse(text) as Record<string, unknown>;
      const llm = String(data.llmSummary ?? data.llm_summary ?? "");
      const mat = String(data.materialityNotes ?? data.materiality_notes ?? "");
      const rawScore = data.materialityScore ?? data.materiality_score;
      const score = typeof rawScore === "number" && !Number.isNaN(rawScore) ? rawScore : null;
      const mid = String(data.modelId ?? data.model_id ?? "");
      const stub = Boolean(data.stub);
      setImpactSessionByVersion((prev) => ({
        ...prev,
        [sessionKey]: {
          llmSummary: llm,
          materialityNotes: mat,
          materialityScore: score ?? undefined,
          agentsModelId: mid,
          stub,
        },
      }));
    } catch (e) {
      setImpactError(e instanceof Error ? e.message : String(e));
    } finally {
      setImpactGenerating(false);
    }
  }, [bffAgentsProxy, currentRun, impactOutputLang]);

  const compareLatestVsPrevious = useCallback(() => {
    setCurrentIdx(0);
    setBaselineIdx(1);
    setTab("doc");
  }, []);

  const ingestedDocumentUrls = useMemo(() => {
    if (!runs) return [];
    const s = new Set<string>();
    for (const r of runs) {
      const u = r.documentUrl;
      if (u) s.add(u);
    }
    return [...s].sort();
  }, [runs]);

  const tabTrigger =
    "rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-600 outline-none transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm";

  const showWorkspaceNav = authPhase === "authed" || authPhase === "open";

  const shell = (body: ReactNode) => (
    <AppShell
      surface={appSurface}
      onSurfaceChange={setAppSurface}
      sessionUser={authPhase === "authed" ? sessionUser : null}
      onLogout={authPhase === "authed" ? logout : undefined}
      showWorkspaceNav={showWorkspaceNav}
    >
      {body}
    </AppShell>
  );

  if (authPhase === "loading") {
    return shell(
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        <p className="mt-6 text-center text-sm font-medium text-zinc-700">Checking session…</p>
        <p className="mt-1 text-center text-xs text-zinc-500">Regulatory web</p>
      </div>,
    );
  }

  if (authPhase === "need_login") {
    return shell(
      <LoginGate
        onLoggedIn={(u) => {
          setSessionUser(u);
          setAuthPhase("authed");
        }}
      />,
    );
  }

  if (loadingRuns) {
    return shell(
      <div className="mx-auto flex max-w-lg flex-col items-center px-6 py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        <p className="mt-6 text-center text-sm font-medium text-zinc-700">Loading ingest runs from Qdrant…</p>
        <p className="mt-1 text-center text-xs text-zinc-500">Ingest run library</p>
      </div>,
    );
  }

  if (runsError) {
    return shell(
      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-lg shadow-red-900/5">
          <h2 className="text-lg font-semibold text-zinc-900">Could not reach Qdrant</h2>
          <p className="mt-2 text-sm text-zinc-600">
            Start the API server (<code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">npm run dev</code>) and
            check <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">QDRANT_*</code> in{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs">web/.env</code>.
          </p>
          <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-red-100 bg-red-50/80 p-3 text-xs text-red-900">
            {runsError}
          </pre>
          <button
            type="button"
            className="mt-6 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            onClick={() => void loadRuns()}
          >
            Retry
          </button>
        </div>
      </main>,
    );
  }

  return shell(
    <>
      {appSurface === "gli_hub" ? (
        <GliIntelligenceHub
          knownDocumentUrls={ingestedDocumentUrls}
          agentsAvailable={bffAgentsProxy}
          onOpenInIngestMonitor={(url) => {
            setSelectedUrl(
              documentUrlsMatch(url, DEMO_CANONICAL_PDF) ? DEMO_CANONICAL_PDF : url,
            );
            setCurrentIdx(0);
            setBaselineIdx(1);
            setAppSurface("ingest_workspace");
          }}
          onNavigateToIngestFeature={(featureId: IngestFeatureFocusId) => {
            setSelectedUrl(DEMO_CANONICAL_PDF);
            setCurrentIdx(0);
            setBaselineIdx(1);
            saveIngestFeatureFocus(featureId);
            setAppSurface("ingest_workspace");
          }}
        />
      ) : (
      <IngestWorkspace>
      {selectedUrl ? (
        <div className="space-y-6">
          <IngestContextBar
            documentUrl={selectedUrl}
            runCount={runsForDoc.length}
            currentRunTimestamp={currentRun?.timestamp}
            hitlStatus={hitlStatus}
            sourceHealth={sourceHealth}
            onOpenHub={() => setAppSurface("gli_hub")}
          />
          {(runs?.length ?? 0) === 0 ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-sm text-sky-950">
              <p className="font-medium">No ingestion runs in Qdrant yet</p>
              <p className="mt-2 text-sky-900/90">
                Configure <code className="rounded bg-white/80 px-1 text-xs">QDRANT_*</code>, run the ingest workflow,
                then pick a canonical URL below. The{" "}
                <button
                  type="button"
                  className="font-medium text-emerald-800 underline decoration-emerald-400 underline-offset-2"
                  onClick={() => setAppSurface("gli_hub")}
                >
                  GLI Intelligence hub
                </button>{" "}
                lists representative sources in the Source library.
              </p>
            </div>
          ) : null}
          <SourceIdentityCard
            url={selectedUrl}
            runCount={runsForDoc.length}
            canCompareLatest={runsForDoc.length >= 2}
            onCompareLatest={compareLatestVsPrevious}
            actionsSlot={
              currentRun ? (
                <RunEvidenceExportButton
                  documentUrl={selectedUrl}
                  baseline={baselineRun ? runToEvidenceSlice(baselineRun) : undefined}
                  current={runToEvidenceSlice(currentRun)}
                  impactDisplay={{
                    executiveSummary: impactExecutive,
                    materialityNotes: impactMateriality,
                    materialityScore: impactScore,
                    agentsModelId: impactModelId,
                    stub: impactStubBadge,
                  }}
                />
              ) : null
            }
          />

          {!bffAgentsProxy ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p className="font-medium">Agents API not proxied</p>
              <p className="mt-1 text-xs leading-relaxed">
                Open <code className="rounded bg-white/80 px-1 font-mono text-[11px]">http://127.0.0.1:9780</code> (BFF +
                Vite proxy). Confirm{" "}
                <code className="rounded bg-white/80 px-1 font-mono text-[11px]">AGENTS_URL=http://127.0.0.1:8000</code> in{" "}
                <code className="rounded bg-white/80 px-1 font-mono text-[11px]">web/.env</code>, then restart{" "}
                <code className="rounded bg-white/80 px-1 font-mono text-[11px]">./scripts/dev-up.sh</code>. Check{" "}
                <code className="rounded bg-white/80 px-1 font-mono text-[11px]">/api/health</code> →{" "}
                <code className="rounded bg-white/80 px-1 font-mono text-[11px]">agentsProxy: true</code>.
              </p>
            </div>
          ) : null}

          <IngestCadenceCallout />

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-100">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Document scope</h2>
            <label className="mt-4 flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-zinc-800">Canonical document URL</span>
              <select
                className={selectClass}
                value={docUrls.some((u) => documentUrlsMatch(u, selectedUrl)) ? selectedUrl : DEMO_CANONICAL_PDF}
                onChange={(e) => {
                  setSelectedUrl(e.target.value);
                  setCurrentIdx(0);
                  setBaselineIdx(1);
                }}
              >
                {docUrls.map((u) => (
                  <option key={u} value={u}>
                    {normalizeDocumentUrl(u) === normalizeDocumentUrl(DEMO_CANONICAL_PDF)
                      ? "★ POC regulation-14 (GitHub PDF)"
                      : u.length > 72
                        ? `${u.slice(0, 72)}…`
                        : u}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
                onClick={() => {
                  void navigator.clipboard?.writeText(DEMO_CANONICAL_PDF);
                }}
              >
                Copy POC URL
              </button>
              <button
                type="button"
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                onClick={() => setSelectedUrl(DEMO_CANONICAL_PDF)}
              >
                Select POC URL
              </button>
            </div>
            {runsForDoc.length === 0 ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs leading-relaxed text-amber-950">
                No Qdrant runs for this URL yet. Run the ingest workflow with{" "}
                <code className="break-all rounded bg-white/80 px-1 font-mono text-[10px]">{DEMO_CANONICAL_PDF}</code>.
              </p>
            ) : (
              <p className="mt-2 text-xs text-emerald-800">
                {runsForDoc.length} ingest run{runsForDoc.length === 1 ? "" : "s"} indexed for this document.
              </p>
            )}
          </section>

          {runsForDoc.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm ring-1 ring-zinc-100">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Compare ingests</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-zinc-800">Current (newer)</span>
                    <select
                      className={selectClass}
                      value={currentIdx}
                      onChange={(e) => setCurrentIdx(Number(e.target.value))}
                    >
                      {runsForDoc.map((r, i) => (
                        <option key={i} value={i}>
                          {labelForRun(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="font-medium text-zinc-800">Baseline (older)</span>
                    <select
                      className={selectClass}
                      value={baselineIdx}
                      onChange={(e) => setBaselineIdx(Number(e.target.value))}
                    >
                      {runsForDoc.map((r, i) => (
                        <option key={i} value={i}>
                          {labelForRun(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <RunDigestGrid
                baseline={baselineRun}
                current={currentRun}
                documentUrl={selectedUrl}
                baselineLabel="Baseline ingest"
                currentLabel="Current ingest"
              />

              <div id="gli-ingest-version">
                <VersionHistoryPanel
                  documentUrl={selectedUrl}
                  runs={runsForDoc}
                  currentIdx={currentIdx}
                  baselineIdx={baselineIdx}
                  onSelectCurrent={setCurrentIdx}
                  onSelectBaseline={setBaselineIdx}
                />
              </div>

              <div id="gli-ingest-change">
                <AutomatedChangeDetectionStrip
                  baselineSummary={baselineRun?.summary}
                  currentSummary={currentRun?.summary}
                />
              </div>

              {(currentRun?.added?.length ?? 0) > 0 ? (
                <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">Research handoff</p>
                  <p className="mt-1 text-sm leading-relaxed text-sky-950">
                    Send ingest deltas to GLI hub for gap analysis (2.4) or cross-jurisdiction compare (2.3).
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                      onClick={() => {
                        const text = (currentRun?.added ?? [])
                          .map((a) => String(a.chunkText ?? "").trim())
                          .filter(Boolean)
                          .join("\n\n");
                        if (text.length < 20) return;
                        saveGapPrefillRegulatoryText(text);
                        setAppSurface("gli_hub");
                      }}
                    >
                      Open gap analysis in GLI hub
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-950 hover:bg-violet-100"
                      onClick={() => {
                        requestCrossPrefillFromIngest();
                        setAppSurface("gli_hub");
                      }}
                    >
                      Open cross-compare in GLI hub
                    </button>
                  </div>
                </div>
              ) : null}

              <div id="gli-ingest-alert">
                <AlertScoringBand
                  materialityScore={impactScore ?? currentRun?.materialityScore}
                  materialityNotes={impactMateriality ?? currentRun?.materialityNotes}
                  executiveSummary={impactExecutive ?? undefined}
                  chunkDelta={currentRun?.summary}
                  sourceIngest={currentRun?.sourceIngest}
                  agentsAvailable={bffAgentsProxy}
                  autoTriageKey={alertAutoTriageKey}
                />
              </div>

              <div
                id="gli-ingest-reggpt"
                className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-3 text-sm text-emerald-950"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">RegGPT</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Open the chat button (bottom-right) for grounded Q&amp;A on the selected document.
                </p>
              </div>

              <HitlReviewBar
                status={hitlStatus}
                onChange={persistHitl}
                disabled={!currentRun || !baselineRun}
                optionalNote={hitlReason}
                onOptionalNoteChange={setHitlReason}
                persistError={hitlPersistError}
                saving={hitlSaving}
              />

              <Tabs.Root
                value={tab}
                onValueChange={(v) => setTab(v as IngestTabId)}
                className="w-full"
              >
                <Tabs.List className="inline-flex flex-wrap gap-1 rounded-xl bg-zinc-200/60 p-1 ring-1 ring-zinc-200/80">
                  {[
                    { id: "doc", label: "Readable diff" },
                    { id: "chunks", label: "Embedding delta" },
                    { id: "now", label: "Live index" },
                  ].map((t) => (
                    <Tabs.Trigger key={t.id} value={t.id} className={tabTrigger}>
                      {t.label}
                    </Tabs.Trigger>
                  ))}
                </Tabs.List>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  <span className="font-medium text-zinc-600">Assistant:</span> use the{" "}
                  <span className="font-medium text-emerald-800">chat button</span> in the bottom-right for grounded Q&amp;A
                  (same scope as this document and compare context).
                </p>

                <Tabs.Content value="doc" className="mt-6 focus:outline-none">
                  {!baselineRun ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-4 text-sm text-amber-950">
                      Pick a <strong>different</strong> baseline than &quot;current&quot; to render a redline between
                      two ingests.
                    </div>
                  ) : !String(baselineRun.fullText ?? "") || !String(currentRun?.fullText ?? "") ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-4 text-sm text-amber-950">
                      One of the runs is missing <code className="rounded bg-white/80 px-1">fullText</code>. Re-run
                      ingestion after the workflow stores full text on each run payload.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Readable diff</h2>

                      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Presentation</p>
                          <div className="mt-2 flex flex-wrap gap-4 text-sm">
                            <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-800">
                              <input
                                type="radio"
                                name="diffPresentation"
                                className="accent-violet-600"
                                checked={diffPresentation === "text"}
                                onChange={() => setDiffPresentation("text")}
                              />
                              Text view
                            </label>
                            <label
                              className={`inline-flex items-center gap-2 ${canShowPdfDiff ? "cursor-pointer text-zinc-800" : "cursor-not-allowed text-zinc-400"}`}
                              title={canShowPdfDiff ? undefined : "Re-run ingest with PDF storage for both runs"}
                            >
                              <input
                                type="radio"
                                name="diffPresentation"
                                className="accent-violet-600"
                                checked={diffPresentation === "pdf"}
                                disabled={!canShowPdfDiff}
                                onChange={() => setDiffPresentation("pdf")}
                              />
                              PDF view (bounding boxes)
                            </label>
                            <label
                              className={`inline-flex items-center gap-2 ${canShowSectionAlign ? "cursor-pointer text-zinc-800" : "cursor-not-allowed text-zinc-400"}`}
                              title={
                                canShowSectionAlign
                                  ? undefined
                                  : "Re-ingest both versions with layout extraction enabled"
                              }
                            >
                              <input
                                type="radio"
                                name="diffPresentation"
                                className="accent-violet-600"
                                checked={diffPresentation === "section"}
                                disabled={!canShowSectionAlign}
                                onChange={() => setDiffPresentation("section")}
                              />
                              By section (cross-page)
                            </label>
                          </div>
                        </div>
                        {diffPresentation === "text" ? (
                        <>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Diff style</p>
                            <div className="mt-2 flex flex-wrap gap-4 text-sm">
                              <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-800">
                                <input
                                  type="radio"
                                  name="view"
                                  className="accent-emerald-600"
                                  checked={viewMode === "side"}
                                  onChange={() => setViewMode("side")}
                                />
                                Side-by-side
                              </label>
                              <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-800">
                                <input
                                  type="radio"
                                  name="view"
                                  className="accent-emerald-600"
                                  checked={viewMode === "unified"}
                                  onChange={() => setViewMode("unified")}
                                />
                                Unified (git-style)
                              </label>
                            </div>
                          </div>
                          {viewMode === "side" && (
                            <label className="flex w-full max-w-sm flex-col gap-1 text-xs text-zinc-600 sm:text-sm">
                              <span>Context lines around each change (0 = changes only)</span>
                              <input
                                type="range"
                                min={0}
                                max={10}
                                value={contextSize}
                                className="accent-emerald-600"
                                onChange={(e) => setContextSize(Number(e.target.value))}
                              />
                            </label>
                          )}
                        </div>
                        <DiffLineLegendFilter value={diffLineFilter} onChange={setDiffLineFilter} />
                        {!fullTextHasFormFeed ? (
                          <label className="flex max-w-md flex-col gap-1.5 text-xs text-zinc-600">
                            <span>
                              Logical pagination when <code className="rounded bg-zinc-100 px-0.5">\f</code> is absent:
                              lines per page (both sides)
                            </span>
                            <select
                              className={selectClass}
                              value={String(diffLinesPerLogicalPage)}
                              onChange={(e) => setDiffLinesPerLogicalPage(Number(e.target.value))}
                            >
                              <option value="0">Off — one scrollable &quot;page&quot;</option>
                              <option value="40">40 lines</option>
                              <option value="60">60 lines</option>
                              <option value="80">80 lines</option>
                              <option value="100">100 lines</option>
                              <option value="150">150 lines</option>
                              <option value="200">200 lines</option>
                            </select>
                          </label>
                        ) : null}
                        </>
                        ) : null}
                      </div>

                      {diffPresentation === "section" &&
                      canShowSectionAlign &&
                      baselineRun &&
                      currentRun &&
                      selectedUrl ? (
                        <SectionAlignedDiff
                          documentUrl={selectedUrl}
                          baselineVersionId={String(baselineRun.versionId ?? baselineRun.timestamp ?? "")}
                          currentVersionId={String(currentRun.versionId ?? currentRun.timestamp ?? "")}
                          baselinePageCount={baselineRun.pdfPageCount ?? baselineRun.layoutArtifact?.pageCount}
                          currentPageCount={currentRun.pdfPageCount ?? currentRun.layoutArtifact?.pageCount}
                          onOpenPdfAtPage={
                            canShowPdfDiff
                              ? (page, _side) => {
                                  setPdfInitialPage(Math.max(0, page - 1));
                                  setDiffPresentation("pdf");
                                }
                              : undefined
                          }
                        />
                      ) : null}

                      {diffPresentation === "pdf" && canShowPdfDiff && baselineRun && currentRun ? (
                        <PdfPageDiffViewer
                          documentUrl={selectedUrl}
                          baselineVersionId={String(baselineRun.versionId ?? baselineRun.timestamp ?? "")}
                          currentVersionId={String(currentRun.versionId ?? currentRun.timestamp ?? "")}
                          changeRegions={pdfChangeRegions}
                          baselinePageCount={baselineRun.pdfPageCount ?? 1}
                          currentPageCount={currentRun.pdfPageCount ?? 1}
                          initialPage={pdfInitialPage}
                        />
                      ) : null}

                      {diffPresentation === "text" && viewMode === "side" && pageWiseLineDiff && (
                        <>
                          <h3 className="text-base font-semibold text-zinc-800">Side-by-side</h3>
          <p className="text-xs leading-relaxed text-zinc-500">
            Each <strong>logical page</strong> uses form-feed breaks (
            <code className="rounded bg-zinc-100 px-1">\f</code>) in <code className="rounded bg-zinc-100 px-1">fullText</code>{" "}
            when present, or the <strong>lines-per-page</strong> bucket you set above when there are no form-feeds.
            Within each logical page, each <strong>line</strong> is compared. <strong>New</strong> lines are green,{" "}
            <strong>modified</strong> lines yellow, <strong>deleted</strong> lines red; changed words inside a modified
            line use red/green tokens.
          </p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Metric label="Replaced (lines)" value={pageWiseLineDiff.totalStats.replaced} accent />
                            <Metric label="Added (lines)" value={pageWiseLineDiff.totalStats.added} />
                            <Metric label="Removed (lines)" value={pageWiseLineDiff.totalStats.removed} />
                            <Metric label="Unchanged (lines)" value={pageWiseLineDiff.totalStats.unchanged} />
                          </div>
                          <PageWiseReadableDiff
                            key={`${baselineRun.timestamp ?? ""}|${baselineRun.versionId ?? ""}|${currentRun.timestamp ?? ""}|${currentRun.versionId ?? ""}|ctx${contextSize}|f${diffLineFilter.showNewLine ? "1" : "0"}${diffLineFilter.showModifiedLine ? "1" : "0"}${diffLineFilter.showDeletedLine ? "1" : "0"}|lp${diffLinesPerLogicalPage}`}
                            pages={pageWiseLineDiff.pages}
                            usedFormFeedPageBoundaries={pageWiseLineDiff.usedFormFeedPageBoundaries}
                            lineBucketPagination={pageWiseLineDiff.lineBucketPagination}
                            linesPerLogicalPageWhenNoFormFeed={pageWiseLineDiff.linesPerLogicalPageWhenNoFormFeed}
                            baselinePdfPageCount={baselineRun.pdfPageCount}
                            currentPdfPageCount={currentRun.pdfPageCount}
                            variant="semantic-lines"
                            baselinePageCount={pageWiseLineDiff.baselinePageCount}
                            currentPageCount={pageWiseLineDiff.currentPageCount}
                            lineFilter={diffLineFilter}
                          />
                        </>
                      )}
                      {diffPresentation === "text" && viewMode === "unified" && unifiedLinesFiltered && (
                        <>
                          <h3 className="text-base font-semibold text-zinc-800">Unified (git-style)</h3>
                          <UnifiedDiffView lines={unifiedLinesFiltered} />
                        </>
                      )}
                    </div>
                  )}
                </Tabs.Content>

                <Tabs.Content value="chunks" className="mt-6 focus:outline-none">
                  <p className="mb-4 text-sm leading-relaxed text-zinc-600">
                    Chunks that entered or left the embedding index for this ingest. Boundaries can shift — use this
                    to validate pipeline cost, not to read legal structure verbatim.
                  </p>
                  {!currentRun ? null : <ChunkTabs currentRun={currentRun} />}
                </Tabs.Content>

                <Tabs.Content value="now" className="mt-6 focus:outline-none">
                  {loadingChunks ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                      Loading live chunks…
                    </div>
                  ) : chunksError ? (
                    <pre className="overflow-auto rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
                      {chunksError}
                    </pre>
                  ) : (
                    <>
                      <p className="mb-3 text-sm text-zinc-600">
                        {liveChunks.length} vectors in <code className="rounded bg-zinc-100 px-1 text-xs">regulatory_docs</code>{" "}
                        for this URL, tinted by ingest version.
                      </p>
                      {versionColors.size > 0 && (
                        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
                          <span className="font-medium text-zinc-700">Versions:</span>
                          {[...versionColors.entries()].map(([v, c]) => (
                            <span key={v} className="rounded-lg px-2.5 py-1 font-medium shadow-sm" style={{ background: c }}>
                              {fmtTs(v)}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="space-y-2">
                        {liveChunks.map((p, idx) => {
                          const meta = p.payload?.metadata ?? {};
                          const idxLabel = meta.chunkIndex ?? "?";
                          const version = String(meta.versionId ?? "");
                          const docHash = meta.documentHash ? String(meta.documentHash) : "";
                          const content = p.payload?.content ?? "";
                          const bg = versionColors.get(version) ?? "#ecfdf5";
                          return (
                            <details
                              key={idx}
                              id={typeof idxLabel === "number" ? chunkElementId(idxLabel) : undefined}
                              className="group rounded-xl border border-zinc-200/90 bg-white shadow-sm open:ring-1 open:ring-emerald-500/10"
                            >
                              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-zinc-800 [&::-webkit-details-marker]:hidden">
                                <span className="flex flex-wrap items-baseline justify-between gap-2">
                                  <span>
                                    Chunk #{idxLabel}{" "}
                                    <span className="font-normal text-zinc-500">·</span>{" "}
                                    <span className="text-zinc-600">ingest {fmtTs(version)}</span>
                                  </span>
                                  {docHash ? (
                                    <span className="font-mono text-[11px] font-normal text-zinc-500" title={docHash}>
                                      doc {docHash.slice(0, 10)}…
                                    </span>
                                  ) : null}
                                </span>
                              </summary>
                              <div className="border-t border-zinc-100 px-4 py-3">
                                <pre
                                  className="whitespace-pre-wrap break-words rounded-lg p-3 font-sans text-[13px] leading-relaxed text-zinc-900"
                                  style={{ background: bg }}
                                >
                                  {content}
                                </pre>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </>
                  )}
                </Tabs.Content>
              </Tabs.Root>
            </div>

            <aside id="gli-ingest-impact" className="relative z-0 space-y-5 lg:sticky lg:top-6 lg:self-start">
              <ImpactSummaryCard
                executiveSummary={impactExecutive}
                materialityNotes={impactMateriality}
                materialityScore={impactScore}
                stub={impactStubBadge}
                modelId={impactModelId}
                persistenceMode={impactPersistenceMode}
                agentsAvailable={bffAgentsProxy}
                impactOutputLanguage={bffAgentsProxy ? impactOutputLang : undefined}
                onImpactOutputLanguageChange={bffAgentsProxy ? setImpactOutputLang : undefined}
                onGenerateImpact={bffAgentsProxy ? () => void generateImpactSummary() : undefined}
                generatingImpact={impactGenerating}
                impactError={impactError}
              />
            </aside>
          </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 text-sm text-amber-950 shadow-sm">
              <p className="font-semibold">No Qdrant runs for this canonical URL yet</p>
              <p className="mt-2 leading-relaxed">
                Run the ingest workflow using this exact{" "}
                <code className="rounded bg-white/70 px-1 text-xs">documentUrl</code>. Representative sources are listed
                under <span className="font-medium">GLI Intelligence hub → Source library</span>.
              </p>
              <button
                type="button"
                className="mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                onClick={() => setAppSurface("gli_hub")}
              >
                Open GLI source library
              </button>
            </div>
          )}
        </div>
      ) : null}
      </IngestWorkspace>
      )}
      {appSurface === "ingest_workspace" && selectedUrl ? (
        <AssistantChatDock
          documentUrl={selectedUrl}
          sessionUser={sessionUser}
          ingestedRunCount={runsForDoc.length}
          compareBaselineText={ingestCompareBaselineText}
          compareCurrentText={ingestCompareCurrentText}
          compareChunkChanges={ingestCompareChunkChanges}
          onNavigateToChunk={navigateToChunk}
          reggptHint={
            runsForDoc.length === 0
              ? "Ingest a run for this URL to enable grounded Q&A."
              : undefined
          }
        />
      ) : null}
    </>,
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`rounded-xl border px-3 py-3 shadow-sm ${
        accent
          ? "border-emerald-200/80 bg-emerald-50/50 ring-1 ring-emerald-500/10"
          : "border-zinc-200/90 bg-white ring-1 ring-zinc-100"
      }`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">{value}</div>
    </div>
  );
}

function ChunkTabs({ currentRun }: { currentRun: Run }) {
  const added = currentRun.added ?? [];
  const removed = currentRun.removed ?? [];
  const [sub, setSub] = useState("added");
  return (
    <Tabs.Root value={sub} onValueChange={setSub} className="w-full">
      <Tabs.List className="inline-flex gap-1 rounded-xl bg-zinc-200/60 p-1">
        <Tabs.Trigger
          value="added"
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
        >
          Added ({added.length})
        </Tabs.Trigger>
        <Tabs.Trigger
          value="removed"
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
        >
          Removed ({removed.length})
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="added" className="mt-4 focus:outline-none">
        {!added.length ? (
          <p className="text-sm text-zinc-600">No new chunks in this ingest.</p>
        ) : (
          <div className="space-y-2">
            {added.map((c, i) => (
              <details key={i} className="rounded-xl border border-emerald-200/80 bg-white shadow-sm">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-emerald-950">
                  Chunk #{c.chunkIndex ?? "?"} · {String(c.chunkText ?? "").length} chars
                </summary>
                <pre className="whitespace-pre-wrap break-words border-t border-emerald-100/80 bg-emerald-50/40 p-4 text-sm text-emerald-950">
                  {c.chunkText ?? ""}
                </pre>
              </details>
            ))}
          </div>
        )}
      </Tabs.Content>
      <Tabs.Content value="removed" className="mt-4 focus:outline-none">
        {!removed.length ? (
          <p className="text-sm text-zinc-600">No chunks removed in this ingest.</p>
        ) : (
          <div className="space-y-2">
            {removed.map((c, i) => (
              <details key={i} className="rounded-xl border border-red-200/80 bg-white shadow-sm">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-red-950">
                  Chunk #{c.chunkIndex ?? "?"} · prior ingest {fmtTs(String(c.previousVersionId ?? ""))}
                </summary>
                <pre className="whitespace-pre-wrap break-words border-t border-red-100/80 bg-red-50/50 p-4 text-sm text-red-950 line-through">
                  {c.chunkText ?? ""}
                </pre>
              </details>
            ))}
          </div>
        )}
      </Tabs.Content>
    </Tabs.Root>
  );
}
