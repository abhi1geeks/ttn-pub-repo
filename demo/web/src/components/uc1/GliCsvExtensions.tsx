import { useCallback, useEffect, useRef, useState } from "react";
import {
  relevanceLabel,
  relevanceTierFromMateriality,
  suggestDemoRoutingQueue,
  topicTagsFromRun,
  type RelevanceTier,
} from "../../lib/alert_triage";
import { postAlertTriage, type AlertTriageResponse } from "../../lib/alert_triage_api";
import {
  changeKindBadgeClass,
  changeKindLabel,
  inferDemoChangeKind,
} from "../../lib/change_signal";
import { buildRunEvidenceExport, downloadJson, type EvidenceRunSlice } from "../../lib/run_evidence_export";
import { featureDisplayName } from "../../lib/product_labels";

type SourceIngestLike = {
  productLine?: string | null;
  jurisdiction?: string | null;
  effectiveDate?: string | null;
};

export function IngestCadenceCallout() {
  return (
    <div className="rounded-xl border border-sky-200/80 bg-sky-50/60 px-4 py-3 text-[13px] leading-relaxed text-sky-950">
      <span className="font-semibold text-sky-900">{featureDisplayName("1.2")}</span> — n8n runs on your
      configured schedule (e.g. daily). This UI compares stored ingest snapshots and surfaces additions / amendments via
      chunk deltas and redline diff.
    </div>
  );
}

export function AutomatedChangeDetectionStrip({
  baselineSummary,
  currentSummary,
}: {
  baselineSummary?: { newChunks?: number; removedChunks?: number; totalChunks?: number };
  currentSummary?: { newChunks?: number; removedChunks?: number; totalChunks?: number };
}) {
  const cur = currentSummary ?? {};
  const base = baselineSummary ?? {};
  const changeKind = inferDemoChangeKind(cur);
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm ring-1 ring-zinc-100">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Change signal (current vs baseline)</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${changeKindBadgeClass(changeKind)}`}
        >
          {changeKindLabel(changeKind)}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-800">
        Current ingest:{" "}
        <strong className="tabular-nums text-emerald-800">+{cur.newChunks ?? 0}</strong> new chunks,{" "}
        <strong className="tabular-nums text-red-800">−{cur.removedChunks ?? 0}</strong> removed,{" "}
        <strong className="tabular-nums text-zinc-900">{cur.totalChunks ?? "—"}</strong> total. Baseline snapshot: +{base.newChunks ?? 0} / −
        {base.removedChunks ?? 0} / {base.totalChunks ?? "—"} total.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
        Redline and embedding tabs classify visible text and vector drift; they do not automatically determine legal
        “amendment vs repeal” — that remains analyst interpretation in this demo.
      </p>
    </section>
  );
}

export function AlertScoringBand({
  materialityScore,
  materialityNotes,
  sourceIngest,
  executiveSummary,
  chunkDelta,
  agentsAvailable,
  autoTriageKey,
}: {
  materialityScore?: number | null;
  materialityNotes?: string | null;
  sourceIngest?: SourceIngestLike | null;
  executiveSummary?: string | null;
  chunkDelta?: { newChunks?: number; removedChunks?: number } | null;
  agentsAvailable?: boolean;
  /** When set (e.g. after impact summary), runs alert-triage once per unique key. */
  autoTriageKey?: string | null;
}) {
  const heuristicTier = relevanceTierFromMateriality(materialityScore ?? undefined);
  const heuristicQueue = suggestDemoRoutingQueue({
    productLine: sourceIngest?.productLine,
    jurisdiction: sourceIngest?.jurisdiction,
  });
  const heuristicTags = topicTagsFromRun({
    productLine: sourceIngest?.productLine,
    jurisdiction: sourceIngest?.jurisdiction,
    effectiveDate: sourceIngest?.effectiveDate,
  });

  const [aiTriage, setAiTriage] = useState<AlertTriageResponse | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);
  const [triageErr, setTriageErr] = useState<string | null>(null);
  const lastAutoKeyRef = useRef<string | null>(null);

  const runAiTriage = useCallback(async () => {
    setTriageErr(null);
    setTriageBusy(true);
    try {
      const result = await postAlertTriage({
        materiality_score: materialityScore ?? undefined,
        executive_summary: executiveSummary?.trim() || undefined,
        materiality_notes: materialityNotes?.trim() || undefined,
        product_line: sourceIngest?.productLine ?? undefined,
        jurisdiction: sourceIngest?.jurisdiction ?? undefined,
        effective_date: sourceIngest?.effectiveDate ?? undefined,
        new_chunks: chunkDelta?.newChunks ?? 0,
        removed_chunks: chunkDelta?.removedChunks ?? 0,
      });
      setAiTriage(result);
    } catch (e) {
      setTriageErr(e instanceof Error ? e.message : String(e));
    } finally {
      setTriageBusy(false);
    }
  }, [materialityScore, executiveSummary, materialityNotes, sourceIngest, chunkDelta]);

  useEffect(() => {
    if (!autoTriageKey || !agentsAvailable) return;
    const hasSignal =
      Boolean(executiveSummary?.trim()) ||
      materialityScore != null ||
      Boolean(materialityNotes?.trim());
    if (!hasSignal) return;
    if (lastAutoKeyRef.current === autoTriageKey) return;
    lastAutoKeyRef.current = autoTriageKey;
    void runAiTriage();
  }, [
    autoTriageKey,
    agentsAvailable,
    executiveSummary,
    materialityScore,
    materialityNotes,
    runAiTriage,
  ]);

  const aiTierRaw = (aiTriage?.relevanceTier ?? aiTriage?.relevance_tier ?? "").toLowerCase();
  const displayTier: RelevanceTier =
    aiTierRaw === "high" || aiTierRaw === "medium" || aiTierRaw === "low" ? aiTierRaw : heuristicTier;
  const displayQueue = aiTriage?.routingQueue ?? aiTriage?.routing_queue ?? heuristicQueue;
  const displayTags = aiTriage?.tags?.length ? aiTriage.tags : heuristicTags;
  const usingAi = Boolean(aiTriage?.routingQueue ?? aiTriage?.routing_queue);

  return (
    <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/80 to-white p-4 shadow-sm ring-1 ring-emerald-500/10">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-900">{featureDisplayName("1.3")}</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            displayTier === "high"
              ? "bg-red-100 text-red-900"
              : displayTier === "medium"
                ? "bg-amber-100 text-amber-900"
                : displayTier === "low"
                  ? "bg-zinc-200 text-zinc-800"
                  : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {relevanceLabel(displayTier)}
        </span>
        {materialityScore != null ? (
          <span className="rounded-full bg-white px-2.5 py-0.5 font-mono text-[11px] font-medium text-zinc-800 ring-1 ring-emerald-200/80">
            Materiality {materialityScore}/5
          </span>
        ) : null}
        {usingAi && aiTriage?.stub ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
            Stub / heuristic
          </span>
        ) : null}
        {usingAi && !aiTriage?.stub ? (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-900">
            AI routing
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-[12px] font-medium text-zinc-800">
        {usingAi ? "Suggested routing (agents)" : "Suggested routing (local rules)"}
      </p>
      <p className="text-sm text-emerald-950">{displayQueue}</p>
      {aiTriage?.rationale ? (
        <p className="mt-2 text-xs leading-relaxed text-zinc-700">{aiTriage.rationale}</p>
      ) : null}
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Auto-tags</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {displayTags.map((t) => (
          <li
            key={t}
            className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-800 ring-1 ring-zinc-200/80"
          >
            {t}
          </li>
        ))}
      </ul>
      <div className="mt-3 border-t border-emerald-200/60 pt-3">
        <button
          type="button"
          disabled={triageBusy || !agentsAvailable}
          onClick={() => void runAiTriage()}
          className="rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {triageBusy ? "Routing…" : usingAi ? "Refresh AI routing" : "Enhance routing with AI"}
        </button>
        {!agentsAvailable ? (
          <p className="mt-2 text-[11px] leading-relaxed text-amber-900">
            Agents proxy is off. Use <code className="rounded bg-white/80 px-1 font-mono text-[10px]">http://127.0.0.1:9780</code>{" "}
            with <code className="rounded bg-white/80 px-1 font-mono text-[10px]">AGENTS_URL</code> in{" "}
            <code className="rounded bg-white/80 px-1 font-mono text-[10px]">web/.env</code>, then restart dev-up.
          </p>
        ) : null}
        {triageBusy && autoTriageKey ? (
          <p className="mt-2 text-[11px] text-zinc-600">Auto-routing from impact summary…</p>
        ) : null}
        {triageErr ? <p className="mt-2 text-xs text-red-800">{triageErr}</p> : null}
      </div>
      {materialityNotes ? (
        <p className="mt-3 border-t border-emerald-200/60 pt-3 text-xs leading-relaxed text-zinc-700">{materialityNotes}</p>
      ) : null}
    </section>
  );
}

export function RunEvidenceExportButton({
  documentUrl,
  baseline,
  current,
  impactDisplay,
  includeFullTextHeadTail,
  disabled,
}: {
  documentUrl: string;
  baseline?: EvidenceRunSlice;
  current?: EvidenceRunSlice;
  impactDisplay?: {
    executiveSummary?: string;
    materialityNotes?: string;
    materialityScore?: number | null;
    agentsModelId?: string;
    stub?: boolean;
  };
  includeFullTextHeadTail?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        const payload = buildRunEvidenceExport({
          documentUrl,
          baseline,
          current,
          impactDisplay,
          includeFullTextHeadTail: Boolean(includeFullTextHeadTail),
        });
        const safe = new Date().toISOString().replace(/[:.]/g, "-");
        downloadJson(`gli-run-evidence-${safe}.json`, payload);
      }}
      className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Export audit JSON
    </button>
  );
}
