import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_CANONICAL_PDF, SOURCES_CATALOG, flattenSourcesCatalog } from "../data/sources_catalog";
import { buildCrossCompareCsv } from "../lib/cross_compare_export";
import { consumeCrossPrefillFromIngest } from "../lib/cross_prefill";
import { buildGapAnalysisMarkdown, downloadTextFile } from "../lib/gap_report_export";
import {
  clearGapPrefillRegulatoryText,
  loadGapPrefillRegulatoryText,
} from "../lib/gap_prefill";
import {
  buildCrossRowsFromIngested,
  buildCrossRowsFromSingleDocument,
  chunksToRegulatoryText,
  fetchDocumentChunks,
} from "../lib/ingest_chunks";
import { documentUrlsMatch } from "../lib/document_url";
import { sectionTitle } from "../lib/product_labels";

type SnippetRow = { rowId: string; label: string; content: string; documentUrl: string };

const MAX_CROSS_ROWS = 4;
const MIN_CROSS_ROWS = 2;

function newSnippetRow(partial?: Omit<SnippetRow, "rowId">): SnippetRow {
  return {
    rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    label: partial?.label ?? "",
    content: partial?.content ?? "",
    documentUrl: partial?.documentUrl ?? "",
  };
}

type CrossApiResponse = {
  headline: string;
  markdownTable?: string;
  markdown_table?: string;
  narrative: string;
  modelId?: string;
  model_id?: string;
  stub?: boolean;
};

type GapItemApi = {
  title: string;
  severity: string;
  description: string;
  recommendedAction?: string;
  recommended_action?: string;
};

type GapApiResponse = {
  executiveSummary?: string;
  executive_summary?: string;
  gaps: GapItemApi[];
  modelId?: string;
  model_id?: string;
  stub?: boolean;
};

async function postAgentsJson<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || r.statusText);
  return JSON.parse(text) as T;
}

const DEMO_SNIPPETS: Omit<SnippetRow, "rowId">[] = [
  {
    label: "Malta (MGA) — demo excerpt",
    documentUrl: "https://demo.gli-intelligence.example/mt/mga/player-protection.pdf",
    content:
      "Technical direction (illustrative): remote gaming systems must maintain tamper-evident logs for RNG seed " +
      "changes and provide a 24-hour incident summary to the regulator upon request. Player limits must be enforced " +
      "server-side without client-only overrides.",
  },
  {
    label: "New Jersey (DGE) — demo excerpt",
    documentUrl: "https://demo.gli-intelligence.example/us-nj/dge-cyber-logging.pdf",
    content:
      "Cybersecurity addendum (illustrative): interactive gaming licensees shall retain security event logs for " +
      "not less than one hundred eighty calendar days and correlate access paths for privileged accounts affecting " +
      "game outcomes or financial integrity.",
  },
];

const DEMO_PROFILE =
  "- RNG change control: dual approval + sealed build hash recorded per release.\n" +
  "- Log retention: security and game outcome logs retained 90 days online, 5 years archive.\n" +
  "- Player limits: mandatory cooling-off after three failed deposit limit increases in 24h.\n" +
  "- Incident reporting: P1 events to regulator within 24h of detection.";

const DEMO_REG_TEXT =
  "Proposed rule change (illustrative): All licensees shall retain complete security event logs for not less than " +
  "one hundred eighty calendar days in online form, and provide regulator API read access for spot checks. RNG " +
  "changes require pre-notification 48 hours prior to deployment except for critical security patches.";

export function GliResearchTools({
  agentsAvailable,
  ingestedDocumentUrls = [],
}: {
  agentsAvailable: boolean;
  ingestedDocumentUrls?: string[];
}) {
  const catalogPicklist = useMemo(() => flattenSourcesCatalog(SOURCES_CATALOG).slice(0, 8), []);
  const catalogFlat = useMemo(() => flattenSourcesCatalog(SOURCES_CATALOG), []);

  const [ingestLoadErr, setIngestLoadErr] = useState<string | null>(null);
  const [ingestLoadBusy, setIngestLoadBusy] = useState(false);
  const [gapPrefillNote, setGapPrefillNote] = useState<string | null>(null);

  const urlsForIngestLoad = useMemo(() => {
    const urls = [...ingestedDocumentUrls];
    if (!urls.some((u) => documentUrlsMatch(u, DEMO_CANONICAL_PDF))) {
      urls.unshift(DEMO_CANONICAL_PDF);
    }
    return urls;
  }, [ingestedDocumentUrls]);

  const labelForUrl = useCallback(
    (url: string) => {
      const hit = catalogFlat.find((p) => documentUrlsMatch(p.documentUrl, url));
      return hit ? `${hit.jurisdiction} — ${hit.regulatoryBody}`.slice(0, 200) : url;
    },
    [catalogFlat],
  );

  const loadCrossFromIngest = useCallback(async () => {
    setIngestLoadErr(null);
    setIngestLoadBusy(true);
    try {
      let drafts = await buildCrossRowsFromIngested(urlsForIngestLoad, {
        maxUrls: 3,
        labelForUrl,
      });
      if (drafts.length < 2) {
        const primary =
          urlsForIngestLoad.find((u) => documentUrlsMatch(u, DEMO_CANONICAL_PDF)) ?? urlsForIngestLoad[0];
        if (primary) drafts = await buildCrossRowsFromSingleDocument(primary);
      }
      if (drafts.length < 2) {
        throw new Error("Run ingest on the demo PDF so Qdrant has at least two chunks.");
      }
      setRows(drafts.map((d) => newSnippetRow(d)));
    } catch (e) {
      setIngestLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setIngestLoadBusy(false);
    }
  }, [urlsForIngestLoad, labelForUrl]);

  const loadGapFromIngest = useCallback(async () => {
    setIngestLoadErr(null);
    setIngestLoadBusy(true);
    try {
      const primary =
        urlsForIngestLoad.find((u) => documentUrlsMatch(u, DEMO_CANONICAL_PDF)) ?? urlsForIngestLoad[0];
      if (!primary) throw new Error("No document URL available for ingest load.");
      const points = await fetchDocumentChunks(primary);
      if (!points.length) throw new Error("No indexed chunks found — run n8n ingest first.");
      const text = chunksToRegulatoryText(points);
      if (text.length < 20) throw new Error("Chunk text too short for gap analysis.");
      setRegText(text);
      setGapPrefillNote(`Loaded ${Math.min(points.length, 6)} chunks from indexed ingest.`);
    } catch (e) {
      setIngestLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setIngestLoadBusy(false);
    }
  }, [urlsForIngestLoad]);

  const [topic, setTopic] = useState("Responsible gaming and technical controls");
  const [rows, setRows] = useState<SnippetRow[]>(() => [newSnippetRow(), newSnippetRow()]);
  const [crossOut, setCrossOut] = useState<CrossApiResponse | null>(null);
  const [crossErr, setCrossErr] = useState<string | null>(null);
  const [crossBusy, setCrossBusy] = useState(false);

  const [profile, setProfile] = useState(DEMO_PROFILE);
  const [regText, setRegText] = useState(DEMO_REG_TEXT);
  const [productLine, setProductLine] = useState("online");
  const [gapOut, setGapOut] = useState<GapApiResponse | null>(null);
  const [gapErr, setGapErr] = useState<string | null>(null);
  const [gapBusy, setGapBusy] = useState(false);

  useEffect(() => {
    const prefill = loadGapPrefillRegulatoryText();
    if (prefill) {
      setRegText(prefill);
      setGapPrefillNote("Loaded regulatory text from ingest monitor (new chunks).");
      clearGapPrefillRegulatoryText();
    }
    if (consumeCrossPrefillFromIngest()) {
      setTopic("Regulatory change — ingest delta");
      void loadCrossFromIngest();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount handoffs only
  }, []);

  const fillDemoSnippets = useCallback(() => {
    setRows(DEMO_SNIPPETS.map((d) => newSnippetRow(d)));
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => {
      if (prev.length <= MIN_CROSS_ROWS) return prev;
      return prev.filter((r) => r.rowId !== rowId);
    });
  }, []);

  const runCross = useCallback(async () => {
    setCrossErr(null);
    setCrossOut(null);
    const snippets = rows
      .map((r) => ({
        label: r.label.trim(),
        content: r.content.trim(),
        documentUrl: r.documentUrl.trim() || undefined,
      }))
      .filter((r) => r.label.length > 0 && r.content.length >= 20);
    if (snippets.length < 2) {
      setCrossErr("Add at least two jurisdictions with labels and excerpts (20+ characters each).");
      return;
    }
    setCrossBusy(true);
    try {
      const data = await postAgentsJson<CrossApiResponse>("/api/agents/v1/agents/cross-jurisdiction", {
        topic: topic.trim(),
        snippets,
      });
      setCrossOut(data);
    } catch (e) {
      setCrossErr(e instanceof Error ? e.message : String(e));
    } finally {
      setCrossBusy(false);
    }
  }, [rows, topic]);

  const downloadCrossMarkdown = useCallback(() => {
    if (!crossOut) return;
    const md = crossOut.markdownTable ?? crossOut.markdown_table ?? "";
    downloadTextFile(
      "gli-cross-jurisdiction.md",
      `## ${crossOut.headline}\n\n${md}\n\n${crossOut.narrative}\n`,
      "text/markdown;charset=utf-8",
    );
  }, [crossOut]);

  const downloadCrossCsv = useCallback(() => {
    if (!crossOut) return;
    const csv = buildCrossCompareCsv({
      topic: topic.trim(),
      headline: crossOut.headline,
      markdownTable: crossOut.markdownTable ?? crossOut.markdown_table ?? "",
      narrative: crossOut.narrative,
      modelId: String(crossOut.modelId ?? crossOut.model_id ?? ""),
      stub: Boolean(crossOut.stub),
    });
    const safe = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(`gli-cross-jurisdiction-${safe}.csv`, csv, "text/csv;charset=utf-8");
  }, [crossOut, topic]);

  const runGap = useCallback(async () => {
    setGapErr(null);
    setGapOut(null);
    if (profile.trim().length < 20 || regText.trim().length < 20) {
      setGapErr("Certification profile and regulatory text must each be at least 20 characters.");
      return;
    }
    setGapBusy(true);
    try {
      const data = await postAgentsJson<GapApiResponse>("/api/agents/v1/agents/gap-analysis", {
        certificationProfile: profile.trim(),
        regulatoryChangeText: regText.trim(),
        productLine: productLine.trim() || undefined,
      });
      setGapOut(data);
    } catch (e) {
      setGapErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGapBusy(false);
    }
  }, [profile, regText, productLine]);

  const downloadGapJson = useCallback(() => {
    if (!gapOut) return;
    downloadTextFile("gli-gap-analysis.json", JSON.stringify(gapOut, null, 2), "application/json;charset=utf-8");
  }, [gapOut]);

  const downloadGapMarkdown = useCallback(() => {
    if (!gapOut) return;
    const md = buildGapAnalysisMarkdown(gapOut, { productLine: productLine.trim() || undefined });
    const safe = new Date().toISOString().replace(/[:.]/g, "-");
    downloadTextFile(`gli-gap-analysis-${safe}.md`, md, "text/markdown;charset=utf-8");
  }, [gapOut, productLine]);

  const disabledReason = !agentsAvailable
    ? "Agents API proxy is off — set AGENTS_URL and restart the web server."
    : null;

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-2 lg:items-start">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm ring-1 ring-zinc-100">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">{sectionTitle("2.3")}</p>
        <h3 className="mt-1 text-lg font-semibold text-zinc-900">Topic matrix (excerpts you supply)</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Paste short excerpts per jurisdiction (same topic). The agents service returns a headline, markdown table, and
          narrative. Export as <code className="rounded bg-zinc-100 px-1 text-xs">.md</code> for workshops.
        </p>
        {disabledReason ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{disabledReason}</p>
        ) : null}
        <label className="mt-4 block text-sm font-medium text-zinc-800">
          Topic
          <input
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
            onClick={fillDemoSnippets}
          >
            Load demo excerpts
          </button>
          <button
            type="button"
            disabled={ingestLoadBusy}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            onClick={() => void loadCrossFromIngest()}
          >
            {ingestLoadBusy ? "Loading…" : "Load from Qdrant ingest"}
          </button>
          <button
            type="button"
            disabled={rows.length >= MAX_CROSS_ROWS}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setRows((r) => (r.length >= MAX_CROSS_ROWS ? r : [...r, newSnippetRow()]))}
          >
            Add jurisdiction row
          </button>
        </div>
        <div className="mt-4 space-y-4">
          {rows.map((row, idx) => (
            <div key={row.rowId} className="rounded-xl border border-zinc-200 p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Jurisdiction {idx + 1}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-800"
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (!id) return;
                      const pick = catalogPicklist.find((p) => p.id === id);
                      e.target.value = "";
                      if (!pick) return;
                      setRows((prev) => {
                        const next = [...prev];
                        next[idx] = {
                          ...next[idx]!,
                          label: `${pick.jurisdiction} — ${pick.regulatoryBody}`.slice(0, 200),
                          documentUrl: pick.documentUrl,
                        };
                        return next;
                      });
                    }}
                  >
                    <option value="">Fill label from library…</option>
                    {catalogPicklist.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.region} · {p.jurisdiction}
                      </option>
                    ))}
                  </select>
                  {rows.length > MIN_CROSS_ROWS ? (
                    <button
                      type="button"
                      onClick={() => removeRow(row.rowId)}
                      className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-900 hover:bg-red-100"
                      aria-label={`Remove jurisdiction ${idx + 1}`}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              <input
                className="mb-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                placeholder="Label (e.g. Malta MGA — player protection)"
                value={row.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((prev) => {
                    const n = [...prev];
                    n[idx] = { ...n[idx]!, label: v };
                    return n;
                  });
                }}
              />
              <input
                className="mb-2 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-xs"
                placeholder="Canonical URL (optional)"
                value={row.documentUrl}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((prev) => {
                    const n = [...prev];
                    n[idx] = { ...n[idx]!, documentUrl: v };
                    return n;
                  });
                }}
              />
              <textarea
                className="min-h-[100px] w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                placeholder="Paste regulatory excerpt for this jurisdiction…"
                value={row.content}
                onChange={(e) => {
                  const v = e.target.value;
                  setRows((prev) => {
                    const n = [...prev];
                    n[idx] = { ...n[idx]!, content: v };
                    return n;
                  });
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!agentsAvailable || crossBusy}
            onClick={() => void runCross()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {crossBusy ? "Running…" : "Generate comparison"}
          </button>
          {crossOut ? (
            <>
              <button
                type="button"
                onClick={downloadCrossMarkdown}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Download .md
              </button>
              <button
                type="button"
                onClick={downloadCrossCsv}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Download .csv
              </button>
            </>
          ) : null}
        </div>
        {ingestLoadErr ? (
          <pre className="mt-3 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            {ingestLoadErr}
          </pre>
        ) : null}
        {crossErr ? (
          <pre className="mt-3 overflow-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">{crossErr}</pre>
        ) : null}
        {crossOut ? (
          <div className="mt-4 space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
            <p className="text-sm font-semibold text-zinc-900">{crossOut.headline}</p>
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-white p-3 font-sans text-sm text-zinc-900 ring-1 ring-zinc-200/80">
              {crossOut.markdownTable ?? crossOut.markdown_table}
            </pre>
            <p className="text-sm leading-relaxed text-zinc-800">{crossOut.narrative}</p>
            <p className="text-[11px] text-zinc-500">
              model={String(crossOut.modelId ?? crossOut.model_id ?? "—")} · stub={String(Boolean(crossOut.stub))}
            </p>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm ring-1 ring-zinc-100">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">{sectionTitle("2.4")}</p>
        <h3 className="mt-1 text-lg font-semibold text-zinc-900">Certification profile vs new text</h3>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Describe your certified posture, paste the updated regulatory language, and receive structured gap rows
          (severity + recommended actions). Export JSON for audit packs.
        </p>
        {disabledReason ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">{disabledReason}</p>
        ) : null}
        <label className="mt-4 block text-sm font-medium text-zinc-800">
          Product line hint (optional)
          <input
            className="mt-1 w-full max-w-md rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            value={productLine}
            onChange={(e) => setProductLine(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-zinc-800">
          Certification / control profile
          <textarea
            className="mt-1 min-h-[120px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-zinc-800">
          New or updated regulatory text
          <textarea
            className="mt-1 min-h-[160px] w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            value={regText}
            onChange={(e) => setRegText(e.target.value)}
          />
        </label>
        {gapPrefillNote ? (
          <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">{gapPrefillNote}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ingestLoadBusy}
            className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            onClick={() => void loadGapFromIngest()}
          >
            {ingestLoadBusy ? "Loading…" : "Load regulatory text from Qdrant"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!agentsAvailable || gapBusy}
            onClick={() => void runGap()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {gapBusy ? "Analyzing…" : "Run gap analysis"}
          </button>
          {gapOut ? (
            <>
              <button
                type="button"
                onClick={downloadGapMarkdown}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Download .md
              </button>
              <button
                type="button"
                onClick={downloadGapJson}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
              >
                Download JSON
              </button>
            </>
          ) : null}
        </div>
        {gapErr ? (
          <pre className="mt-3 overflow-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">{gapErr}</pre>
        ) : null}
        {gapOut ? (
          <div className="mt-4 space-y-3">
            {(gapOut.executiveSummary ?? gapOut.executive_summary ?? "").includes("Bedrock error") ||
            (gapOut.executiveSummary ?? gapOut.executive_summary ?? "").includes("Unable to locate credentials") ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Live LLM call failed — check <code className="rounded bg-white/80 px-1 text-xs">demo/.env</code> AWS
                credentials and restart <code className="rounded bg-white/80 px-1 text-xs">dev-up.sh</code>.
              </p>
            ) : null}
            <p className="rounded-lg bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-900">
              {gapOut.executiveSummary ?? gapOut.executive_summary}
            </p>
            <ul className="space-y-2">
              {(gapOut.gaps ?? []).map((g, i) => (
                <li key={i} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-900">{g.title}</span>
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-900">
                      {g.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-zinc-800">{g.description}</p>
                  <p className="mt-2 text-xs font-medium text-emerald-900">
                    Action: {g.recommendedAction ?? g.recommended_action}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
