import { useState, type ReactNode } from "react";
import { fmtTs } from "../../lib/format";
import type { RunSummary } from "../../lib/uc1";
import { shortHash } from "../../lib/uc1";

export const selectClass =
  "uc1-select w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-500/15";

export function Uc1Hero({ rightSlot }: { rightSlot?: ReactNode }) {
  return (
    <div className="relative overflow-hidden border-b border-emerald-900/10 bg-gradient-to-br from-emerald-950 via-zinc-900 to-zinc-950 text-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-6 px-6 py-10 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/90">Use case UC1</p>
          <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Regulatory change monitor
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
            One canonical source URL per document. Each scheduled ingest captures the next published PDF version,
            embeddings, and a replayable diff so compliance teams can see what moved—without hunting attachments.
          </p>
        </div>
        {rightSlot ? <div className="shrink-0 lg:pt-1">{rightSlot}</div> : null}
      </div>
    </div>
  );
}

export function SourceIdentityCard({
  url,
  runCount,
  onCompareLatest,
  canCompareLatest,
}: {
  url: string;
  runCount: number;
  onCompareLatest: () => void;
  canCompareLatest: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm ring-1 ring-zinc-100">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
              Canonical source
            </span>
            <span className="text-xs text-zinc-500">{runCount} ingest run{runCount === 1 ? "" : "s"} on file</span>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block break-all text-sm font-medium text-emerald-800 underline decoration-emerald-300/80 underline-offset-2 hover:text-emerald-950"
          >
            {url}
          </a>
          <p className="mt-2 text-xs leading-relaxed text-zinc-500">
            Keep this URL stable across updates. When the issuer republishes the PDF, re-run ingestion: the newest run
            becomes &quot;current&quot; while history stays available for comparison.
          </p>
        </div>
        {canCompareLatest ? (
          <button
            type="button"
            onClick={onCompareLatest}
            className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-900/10 transition hover:bg-emerald-500 active:scale-[0.99]"
          >
            Latest vs previous ingest
          </button>
        ) : null}
      </div>
    </div>
  );
}

type RunLike = {
  timestamp?: string;
  versionId?: string;
  documentHash?: string;
  summary?: RunSummary;
  pdfPageCount?: number;
  pdfPageCountSource?: string;
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
};

export function RunDigestGrid({
  baseline,
  current,
  baselineLabel,
  currentLabel,
}: {
  baseline?: RunLike;
  current?: RunLike;
  baselineLabel: string;
  currentLabel: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RunDigestCard title={baselineLabel} variant="muted" run={baseline} />
      <RunDigestCard title={currentLabel} variant="accent" run={current} />
    </div>
  );
}

function RunDigestCard({
  title,
  run,
  variant,
}: {
  title: string;
  run?: RunLike;
  variant: "muted" | "accent";
}) {
  const ring = variant === "accent" ? "ring-emerald-500/20" : "ring-zinc-100";
  const bar = variant === "accent" ? "bg-emerald-500" : "bg-zinc-300";
  const s = run?.summary ?? {};
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ${ring}`}>
      <div className={`absolute left-0 top-0 h-full w-1 ${bar}`} aria-hidden />
      <p className="pl-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      {run ? (
        <dl className="mt-3 space-y-2 pl-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-zinc-500">Ingested</dt>
            <dd className="font-medium text-zinc-900">{fmtTs(String(run.timestamp ?? ""))}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-zinc-500">Version id</dt>
            <dd className="max-w-[60%] truncate font-mono text-xs text-zinc-800" title={String(run.versionId ?? "")}>
              {run.versionId ? shortHash(String(run.versionId), 18) : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-zinc-500">Document hash</dt>
            <dd className="font-mono text-xs text-zinc-800" title={String(run.documentHash ?? "")}>
              {shortHash(run.documentHash ? String(run.documentHash) : undefined, 14)}
            </dd>
          </div>
          {run.pdfPageCount != null ? (
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">PDF pages</dt>
              <dd className="text-right text-xs text-zinc-800" title={run.pdfPageCountSource ?? ""}>
                <span className="font-semibold tabular-nums">{run.pdfPageCount}</span>
                {run.pdfPageCountSource ? (
                  <span className="ml-1 text-zinc-500">({run.pdfPageCountSource})</span>
                ) : null}
              </dd>
            </div>
          ) : null}
          {run.sourceIngest?.fetchedAt || run.sourceIngest?.httpStatus != null ? (
            <div className="border-t border-zinc-100 pt-2 text-[11px] leading-snug text-zinc-600">
              <span className="font-semibold text-zinc-700">Source fetch</span>
              {run.sourceIngest?.httpStatus != null ? (
                <span className="ml-1 tabular-nums">HTTP {run.sourceIngest.httpStatus}</span>
              ) : null}
              {run.sourceIngest?.fetchedAt ? (
                <span className="ml-1">· {fmtTs(String(run.sourceIngest.fetchedAt))}</span>
              ) : null}
              {run.sourceIngest?.error ? (
                <span className="mt-0.5 block text-amber-800">{run.sourceIngest.error}</span>
              ) : null}
              {run.sourceIngest?.productLine || run.sourceIngest?.jurisdiction || run.sourceIngest?.effectiveDate ? (
                <span className="mt-1 block text-zinc-500">
                  {[run.sourceIngest?.productLine, run.sourceIngest?.jurisdiction, run.sourceIngest?.effectiveDate]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-3 text-xs">
            <div>
              <span className="text-zinc-500">Δ chunks +</span>
              <span className="ml-1 font-semibold tabular-nums text-emerald-700">{s.newChunks ?? "—"}</span>
            </div>
            <div>
              <span className="text-zinc-500">Δ chunks −</span>
              <span className="ml-1 font-semibold tabular-nums text-red-700">{s.removedChunks ?? "—"}</span>
            </div>
            <div className="col-span-2 text-zinc-500">
              Total chunks this snapshot:{" "}
              <span className="font-medium text-zinc-800">{s.totalChunks ?? "—"}</span>
            </div>
          </div>
        </dl>
      ) : (
        <p className="mt-3 pl-2 text-sm text-zinc-500">Select a different baseline to compare.</p>
      )}
    </div>
  );
}

export function ImpactSummaryCard({
  executiveSummary,
  materialityNotes,
  materialityScore,
  stub,
  modelId,
  agentsAvailable,
  onGenerateImpact,
  generatingImpact,
  impactError,
}: {
  executiveSummary?: string;
  materialityNotes?: string;
  materialityScore?: number | null;
  stub?: boolean;
  modelId?: string;
  agentsAvailable?: boolean;
  onGenerateImpact?: () => void;
  generatingImpact?: boolean;
  impactError?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasCopy = Boolean(
    (executiveSummary && executiveSummary.trim()) || (materialityNotes && materialityNotes.trim()),
  );
  const scoreLabel =
    materialityScore == null
      ? null
      : materialityScore <= 2
        ? "Low"
        : materialityScore === 3
          ? "Medium"
          : "Elevated";

  return (
    <div className="relative z-0 overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 p-5 shadow-sm ring-1 ring-zinc-100/80">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-900">Impact summary (UC1-005)</h2>
        <div className="flex flex-wrap items-center gap-2">
          {materialityScore != null ? (
            <span
              className="rounded-md bg-emerald-100/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900"
              title="Model-estimated materiality for this ingest delta (1–5)."
            >
              Materiality {materialityScore}/5{scoreLabel ? ` · ${scoreLabel}` : ""}
            </span>
          ) : null}
          {stub ? (
            <span className="rounded-md bg-amber-100/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
              Stub / offline
            </span>
          ) : null}
          <span className="rounded-md bg-zinc-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
            POC
          </span>
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-zinc-300/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
          >
            {expanded ? "▲ Shrink" : "▼ Expand"}
          </button>
        </div>
      </div>

      {expanded ? (
        <>
          {modelId ? (
            <p className="mt-2 text-[10px] text-zinc-500">
              Model <span className="font-mono">{modelId}</span>
            </p>
          ) : null}

          <div className="mt-3 max-h-[min(52vh,24rem)] overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1">
            {hasCopy ? (
              <div className="space-y-3 text-sm leading-relaxed text-zinc-800">
                {executiveSummary?.trim() ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Executive read</p>
                    <p className="mt-1">{executiveSummary.trim()}</p>
                  </div>
                ) : null}
                {materialityNotes?.trim() ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      Materiality & follow-up
                    </p>
                    <p className="mt-1">{materialityNotes.trim()}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-zinc-600">
                No ingest summary on this run yet. Generate one from chunk deltas (SummaryAgent), or have n8n merge{" "}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">llmSummary</code> /{" "}
                <code className="rounded bg-white px-1 py-0.5 font-mono text-xs">materialityNotes</code> into the Qdrant
                run payload after ingest.
              </p>
            )}
          </div>

          {agentsAvailable ? (
            <div className="mt-4 shrink-0 border-t border-zinc-200/80 pt-3">
              <button
                type="button"
                disabled={Boolean(generatingImpact) || !onGenerateImpact}
                onClick={onGenerateImpact}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingImpact ? "Generating…" : hasCopy ? "Regenerate impact summary" : "Generate impact summary"}
              </button>
              <p className="mt-2 text-[11px] text-zinc-500">
                Calls{" "}
                <code className="rounded bg-white/80 px-1 font-mono text-[10px]">POST /api/agents/v1/agents/summary</code>{" "}
                using this run&apos;s chunk delta previews (session-only until you persist via n8n).
              </p>
            </div>
          ) : (
            <p className="mt-4 shrink-0 border-t border-zinc-200/80 pt-3 text-[11px] text-zinc-500">
              Set <code className="rounded bg-white/80 px-1 font-mono text-[10px]">AGENTS_URL</code> in{" "}
              <code className="rounded bg-white/80 px-1 font-mono text-[10px]">web/.env</code> to enable one-click
              summary from the agents service.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-zinc-600">
            {hasCopy
              ? "Impact narrative is available for this run. Expand to read the executive summary and materiality notes."
              : "No ingest summary on this run yet. Expand for full guidance, or generate a summary below."}
          </p>
          {modelId ? (
            <p className="mt-1 text-[10px] text-zinc-500">
              Model <span className="font-mono">{modelId}</span>
            </p>
          ) : null}
          {agentsAvailable ? (
            <div className="mt-3 border-t border-zinc-200/80 pt-3">
              <button
                type="button"
                disabled={Boolean(generatingImpact) || !onGenerateImpact}
                onClick={onGenerateImpact}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generatingImpact ? "Generating…" : hasCopy ? "Regenerate impact summary" : "Generate impact summary"}
              </button>
            </div>
          ) : (
            <p className="mt-3 border-t border-zinc-200/80 pt-3 text-[11px] text-zinc-500">
              Agents proxy offline — expand for setup details.
            </p>
          )}
        </>
      )}

      {impactError ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-900">{impactError}</p>
      ) : null}
    </div>
  );
}

export type HitlStatus = "none" | "acknowledged" | "flagged";

export function HitlReviewBar({
  status,
  onChange,
  disabled,
  optionalNote,
  onOptionalNoteChange,
  persistError,
  saving,
}: {
  status: HitlStatus;
  onChange: (s: HitlStatus) => void | Promise<void>;
  disabled: boolean;
  optionalNote?: string;
  onOptionalNoteChange?: (s: string) => void;
  persistError?: string | null;
  saving?: boolean;
}) {
  const busy = Boolean(saving);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-amber-500/10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Reviewer checkpoint (UC1-006)</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            When a run id is available, your choice is written to the <strong>run record in Qdrant</strong> (shared,
            survives refresh). Otherwise this browser keeps a session fallback. No SharePoint or email is sent.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void onChange("acknowledged")}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
              status === "acknowledged"
                ? "bg-emerald-600 text-white shadow-sm"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            } disabled:opacity-40`}
          >
            Acknowledge
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void onChange("flagged")}
            className={`rounded-lg px-3 py-2 text-xs font-medium transition ${
              status === "flagged"
                ? "bg-amber-600 text-white shadow-sm"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            } disabled:opacity-40`}
          >
            Flag for follow-up
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void onChange("none")}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
      {onOptionalNoteChange ? (
        <label className="mt-3 block text-xs text-zinc-600">
          <span className="font-medium text-zinc-800">Optional note</span> (stored with Acknowledge / Flag)
          <textarea
            className="mt-1.5 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-amber-400/70 focus:ring-2 focus:ring-amber-500/15"
            rows={2}
            maxLength={2000}
            value={optionalNote ?? ""}
            disabled={disabled || busy}
            onChange={(e) => onOptionalNoteChange(e.target.value)}
            placeholder="e.g. escalate to legal, or cite internal ticket"
          />
        </label>
      ) : null}
      {busy ? <p className="mt-2 text-xs text-zinc-500">Saving to Qdrant…</p> : null}
      {persistError ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2 text-xs text-red-900">{persistError}</p>
      ) : null}
    </div>
  );
}
