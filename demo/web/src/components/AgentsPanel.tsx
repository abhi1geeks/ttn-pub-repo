import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { parseInlineAgentText, structureAgentAnswer } from "../lib/agentAnswerFormat";

type BffHealth = {
  ok?: boolean;
  agentsProxy?: boolean;
  qdrantAuthHeader?: boolean;
};

type AgenticJson = {
  intent?: string;
  intent_id?: number;
  supervisor_route?: string;
  blocked?: boolean;
  reason?: string | null;
  executed?: boolean;
  needs_input?: string[];
  fallback_from?: string | null;
  qna?: { answer?: string; cited_chunk_indices?: number[]; model_id?: string; stub?: boolean } | null;
  summary?: { llmSummary?: string; materialityNotes?: string; llm_summary?: string; materiality_notes?: string } | null;
  comparison?: {
    headline?: string;
    narrative?: string;
    model_id?: string;
    stub?: boolean;
    debug_meta?: Record<string, unknown> | null;
  } | null;
  debug_trace?: Record<string, unknown> | null;
};

type UserMsg = { id: string; role: "user"; text: string };
type AssistantMsg = { id: string; role: "assistant"; raw: string; data: AgenticJson };
type ChatMsg = UserMsg | AssistantMsg;

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeExportFilename(prefix: string, ext: string) {
  const ts = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  return `${prefix}-${ts}.${ext}`;
}

async function readJsonSafe(url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const r = await fetch(url);
  let json: unknown = null;
  try {
    json = await r.json();
  } catch {
    json = null;
  }
  return { ok: r.ok, status: r.status, json };
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatAssistantBody(data: AgenticJson): ReactNode {
  const qna = data.qna;
  const summary = data.summary;
  const comp = data.comparison;

  const metaBits: string[] = [];
  if (data.intent != null) metaBits.push(String(data.intent));
  if (data.supervisor_route != null) metaBits.push(String(data.supervisor_route));
  if (data.executed === true) metaBits.push("executed");
  else if (data.executed === false) metaBits.push("not executed");
  if (data.fallback_from) metaBits.push(`fallback: ${data.fallback_from}`);

  const metaLine = metaBits.length > 0 ? metaBits.join(" · ") : null;

  let body: ReactNode = null;

  if (data.blocked && data.intent === "blocked") {
    body = (
      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-sm leading-relaxed text-rose-950">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-800">Blocked</p>
        <p className="mt-1">{parseInlineAgentText(data.reason || "This request could not be processed.")}</p>
      </div>
    );
  } else if (data.executed && qna?.answer) {
    const cited = Array.isArray(qna.cited_chunk_indices) ? qna.cited_chunk_indices : [];
    const modelNote = [qna.stub ? "stub response" : null, qna.model_id ? `model ${qna.model_id}` : null]
      .filter(Boolean)
      .join(" · ");
    body = (
      <div className="mt-3 space-y-4 text-zinc-800">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Answer</p>
          <div className="mt-2">{structureAgentAnswer(qna.answer)}</div>
        </div>
        {cited.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sources (chunks)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cited.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-zinc-700"
                  title="Chunk index cited in the answer"
                >
                  #{n}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {modelNote ? <p className="text-[11px] text-zinc-500">{modelNote}</p> : null}
      </div>
    );
  } else if (data.executed && comp) {
    body = (
      <div className="mt-3 space-y-3 text-zinc-800">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Comparison</p>
          {comp.headline ? (
            <p className="mt-2 text-sm font-semibold leading-snug text-zinc-900">{comp.headline}</p>
          ) : null}
        </div>
        {comp.narrative ? (
          <div className="text-[13px] leading-relaxed text-zinc-700">{structureAgentAnswer(comp.narrative)}</div>
        ) : null}
      </div>
    );
  } else if (data.executed && summary) {
    const llm = summary.llmSummary ?? summary.llm_summary ?? "";
    const mat = summary.materialityNotes ?? summary.materiality_notes ?? "";
    body = (
      <div className="mt-3 space-y-4 text-zinc-800">
        {llm ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Summary</p>
            <div className="mt-2">{structureAgentAnswer(llm)}</div>
          </div>
        ) : null}
        {mat ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Materiality</p>
            <div className="mt-2 text-[13px] leading-relaxed text-zinc-600">{structureAgentAnswer(mat)}</div>
          </div>
        ) : null}
      </div>
    );
  } else if (data.needs_input && data.needs_input.length > 0) {
    body = (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm text-amber-950">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">More input needed</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed">
          {data.needs_input.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        {data.reason ? (
          <p className="mt-3 border-t border-amber-200/80 pt-2 text-xs leading-relaxed text-amber-900/90">
            {parseInlineAgentText(data.reason)}
          </p>
        ) : null}
      </div>
    );
  } else if (data.reason && !data.executed) {
    body = (
      <div className="mt-3 text-[13px] leading-relaxed text-zinc-700">
        {parseInlineAgentText(data.reason)}
      </div>
    );
  } else {
    body = <p className="mt-3 text-sm text-zinc-500">No answer payload in this response.</p>;
  }

  return (
    <div>
      {metaLine ? (
        <p className="text-[11px] leading-relaxed text-zinc-500" title="Supervisor routing and execution">
          {metaLine}
        </p>
      ) : null}
      {body}
    </div>
  );
}

export function AgentsPanel({
  documentUrl,
  compareBaselineText = "",
  compareCurrentText = "",
  compareChunkChanges = [],
}: {
  documentUrl: string;
  /** From Document tab → Compare ingests: Baseline (older) run `fullText` (same as Readable diff). */
  compareBaselineText?: string;
  /** From Document tab → Compare ingests: Current (newer) run `fullText`. */
  compareCurrentText?: string;
  /** From current run ingest delta: added/removed chunk excerpts (Embedding delta tab). */
  compareChunkChanges?: { kind: "added" | "removed"; chunk_index: number | null; excerpt: string }[];
}) {
  const [bffHealth, setBffHealth] = useState<BffHealth | null>(null);
  const [agentsHealth, setAgentsHealth] = useState<unknown>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [qnaQdrant, setQnaQdrant] = useState("http://qdrant:6333");
  const [agenticBaseline, setAgenticBaseline] = useState("");
  const [agenticCurrent, setAgenticCurrent] = useState("");
  const [agenticSummaryJson, setAgenticSummaryJson] = useState("");
  const [agenticDebugTrace, setAgenticDebugTrace] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [orchMsg, setOrchMsg] = useState("What changed between versions?");
  const [orchOut, setOrchOut] = useState<string>("");
  const [qnaQ, setQnaQ] = useState(
    "Summarize the main obligations in this document (from retrieved chunks only).",
  );
  const [chatForceQna, setChatForceQna] = useState(true);
  const [qnaOut, setQnaOut] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement>(null);

  const loadBffHealth = useCallback(async () => {
    setErr(null);
    const res = await readJsonSafe("/api/health");
    if (!res.ok) {
      setBffHealth(null);
      setErr(`GET /api/health failed (${res.status})`);
      return;
    }
    setBffHealth(res.json as BffHealth);
  }, []);

  const loadAgentsHealth = useCallback(async () => {
    setErr(null);
    setBusy(true);
    const res = await readJsonSafe("/api/agents/health");
    setBusy(false);
    if (!res.ok) {
      setAgentsHealth(null);
      setErr(
        `Agents health failed (${res.status}). Set AGENTS_URL in web/.env (e.g. http://127.0.0.1:8000) and restart the dev server.`,
      );
      return;
    }
    setAgentsHealth(res.json);
  }, []);

  useEffect(() => {
    void loadBffHealth();
  }, [loadBffHealth]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const proxyOn = Boolean(bffHealth?.agentsProxy);

  const ingestBaselineLen = compareBaselineText.trim().length;
  const ingestCurrentLen = compareCurrentText.trim().length;
  const ingestCompareReady = ingestBaselineLen >= 8 && ingestCurrentLen >= 8;

  const sendChat = async () => {
    const text = draft.trim();
    if (!text || !proxyOn) return;
    setErr(null);
    setDraft("");
    const userId = uid();
    setMessages((m) => [...m, { id: userId, role: "user", text }]);
    setBusy(true);

    let summary_context: unknown = undefined;
    if (agenticSummaryJson.trim()) {
      try {
        summary_context = JSON.parse(agenticSummaryJson) as unknown;
      } catch {
        setErr("Summary JSON is invalid — fix it under “Retrieval options” or clear the field.");
        setBusy(false);
        setDraft(text);
        setMessages((m) => m.filter((x) => x.id !== userId));
        return;
      }
    }
    const manualOk =
      agenticBaseline.trim().length >= 8 && agenticCurrent.trim().length >= 8;
    const chunkPayload = compareChunkChanges.slice(0, 48);
    const compare_context = ingestCompareReady
      ? {
          baseline_text: compareBaselineText,
          current_text: compareCurrentText,
          ...(chunkPayload.length > 0 ? { chunk_changes: chunkPayload } : {}),
        }
      : manualOk
        ? { baseline_text: agenticBaseline, current_text: agenticCurrent }
        : undefined;

    try {
      const r = await fetch("/api/agents/v1/workflow/agentic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          document_url: documentUrl || undefined,
          qdrant_url: qnaQdrant,
          qdrant_collection: "regulatory_docs",
          qdrant_api_key: "",
          top_k: 8,
          debug: agenticDebugTrace,
          force_qna: chatForceQna,
          ...(compare_context ? { compare_context } : {}),
          ...(summary_context !== undefined ? { summary_context } : {}),
        }),
      });
      const raw = await r.text();
      if (!r.ok) {
        setErr(`Request failed (${r.status}): ${raw.slice(0, 400)}`);
        setMessages((m) => m.filter((x) => x.id !== userId));
        setDraft(text);
        return;
      }
      let data: AgenticJson = {};
      try {
        data = JSON.parse(raw) as AgenticJson;
      } catch {
        data = { reason: raw };
      }
      setMessages((m) => [...m, { id: uid(), role: "assistant", raw, data }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setMessages((m) => m.filter((x) => x.id !== userId));
      setDraft(text);
    } finally {
      setBusy(false);
    }
  };

  const clearThread = () => {
    setMessages([]);
    setErr(null);
  };

  const exportConversationJson = useCallback(() => {
    if (messages.length === 0) return;
    const payload = {
      format: "regulatory-agents-chat-export-v1",
      exportedAt: new Date().toISOString(),
      scope: { documentUrl: documentUrl || null },
      optionsSnapshot: {
        qdrant_url: qnaQdrant,
        request_debug_trace: agenticDebugTrace,
        compare_ingest_baseline_chars: compareBaselineText.length,
        compare_ingest_current_chars: compareCurrentText.length,
        compare_chunk_changes_count: compareChunkChanges.length,
      },
      messages: messages.map((m) => {
        if (m.role === "user") {
          return { role: "user" as const, id: m.id, text: m.text };
        }
        return {
          role: "assistant" as const,
          id: m.id,
          agentResponse: m.data,
          rawHttpBody: m.raw,
        };
      }),
    };
    downloadTextFile(
      safeExportFilename("agents-chat", "json"),
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8",
    );
  }, [
    messages,
    documentUrl,
    qnaQdrant,
    agenticDebugTrace,
    compareBaselineText,
    compareCurrentText,
    compareChunkChanges,
  ]);

  const exportConversationTxt = useCallback(() => {
    if (messages.length === 0) return;
    const lines: string[] = [
      "Regulatory Assistant — conversation transcript",
      `Exported (UTC): ${new Date().toISOString()}`,
      `Document scope: ${documentUrl || "(none)"}`,
      `Qdrant URL: ${qnaQdrant}`,
      `Request debug_trace flag: ${agenticDebugTrace}`,
      `Compare ingest — baseline chars: ${compareBaselineText.length}, current chars: ${compareCurrentText.length}; chunk_changes rows: ${compareChunkChanges.length}`,
      "",
      "===",
      "",
    ];
    for (const m of messages) {
      if (m.role === "user") {
        lines.push(`[USER] ${m.id}`, m.text, "", "===", "");
      } else {
        lines.push(`[ASSISTANT] ${m.id}`, JSON.stringify(m.data, null, 2), "", "===", "");
      }
    }
    downloadTextFile(safeExportFilename("agents-chat", "txt"), lines.join("\n"), "text/plain;charset=utf-8");
  }, [
    messages,
    documentUrl,
    qnaQdrant,
    agenticDebugTrace,
    compareBaselineText,
    compareCurrentText,
    compareChunkChanges,
  ]);

  const runOrchestrate = async () => {
    setErr(null);
    setBusy(true);
    setOrchOut("");
    try {
      const r = await fetch("/api/agents/v1/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_message: orchMsg,
          document_url: documentUrl || undefined,
        }),
      });
      const t = await r.text();
      if (!r.ok) setErr(`Orchestrate ${r.status}: ${t.slice(0, 400)}`);
      else {
        try {
          setOrchOut(JSON.stringify(JSON.parse(t), null, 2));
        } catch {
          setOrchOut(t);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runQna = async () => {
    setErr(null);
    setBusy(true);
    setQnaOut("");
    try {
      const r = await fetch("/api/agents/v1/pipelines/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: qnaQ,
          document_url: documentUrl,
          qdrant_url: qnaQdrant,
          qdrant_collection: "regulatory_docs",
          qdrant_api_key: "",
          top_k: 8,
          force_qna: chatForceQna,
        }),
      });
      const t = await r.text();
      if (!r.ok) setErr(`Chat pipeline ${r.status}: ${t.slice(0, 500)}`);
      else {
        try {
          setQnaOut(JSON.stringify(JSON.parse(t), null, 2));
        } catch {
          setQnaOut(t);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[32rem] flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900">Assistant</h2>
          <p className="mt-0.5 max-w-xl text-sm text-zinc-600">
            Ask questions in natural language. The supervisor routes your message to the right agent; answers use the
            selected run&apos;s document when indexed in Qdrant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              proxyOn
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-zinc-300 bg-zinc-100 text-zinc-600"
            }`}
          >
            {proxyOn ? "Agents connected" : "Agents offline"}
          </span>
          <button
            type="button"
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={() => void loadBffHealth()}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={!proxyOn || busy}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            onClick={() => void loadAgentsHealth()}
          >
            Ping agents
          </button>
          <button
            type="button"
            disabled={messages.length === 0}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            onClick={exportConversationJson}
          >
            Export JSON
          </button>
          <button
            type="button"
            disabled={messages.length === 0}
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
            onClick={exportConversationTxt}
          >
            Export transcript
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
            onClick={clearThread}
          >
            Clear chat
          </button>
        </div>
      </div>

      {documentUrl ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] text-zinc-600">
          <span className="font-semibold text-zinc-500">Scope </span>
          <span className="break-all font-mono text-zinc-800">{documentUrl}</span>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Select a run with a document URL to scope questions.
        </div>
      )}

      <details className="rounded-xl border border-zinc-200 bg-white text-sm ring-1 ring-zinc-100 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer px-3 py-2 font-medium text-zinc-700 hover:bg-zinc-50/80">
          Retrieval and branch options
        </summary>
        <div className="space-y-3 border-t border-zinc-100 px-3 pb-3 pt-2">
          <label className="block text-xs font-medium text-zinc-600">
            Qdrant base URL (from the agents container, e.g. Docker)
            <input
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs text-zinc-900"
              value={qnaQdrant}
              onChange={(e) => setQnaQdrant(e.target.value)}
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-600">
            <input
              type="checkbox"
              className="rounded border-zinc-300"
              checked={agenticDebugTrace}
              onChange={(e) => setAgenticDebugTrace(e.target.checked)}
            />
            <span>
              Include <strong>debug_trace</strong> on each assistant reply (routing, branch, retrieve stats; compare
              prompt sizes). Turn off to shrink payloads.
            </span>
          </label>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
            <p className="font-medium text-zinc-800">Where compare_context comes from</p>
            <p className="mt-1">
              <strong className="text-zinc-700">Primary:</strong> Document tab → <strong>Compare ingests</strong> —
              <code className="mx-0.5 rounded bg-white px-1 py-px font-mono text-[10px]">baseline_text</code> is the{" "}
              <em>Baseline (older)</em> run&apos;s <code className="rounded bg-white px-1 py-px font-mono text-[10px]">fullText</code>;{" "}
              <code className="mx-0.5 rounded bg-white px-1 py-px font-mono text-[10px]">current_text</code> is the{" "}
              <em>Current (newer)</em> run&apos;s <code className="rounded bg-white px-1 py-px font-mono text-[10px]">fullText</code>{" "}
              (same sources as the Readable diff). If either run lacks text or is too short, the agent asks for more input.
            </p>
            <p className="mt-2 font-mono text-[10px] text-zinc-500">
              Ingest pair: baseline {ingestBaselineLen.toLocaleString()} chars · current{" "}
              {ingestCurrentLen.toLocaleString()} chars
              {ingestCompareReady ? (
                <span className="ml-2 text-emerald-700">— will be sent on compare-style questions</span>
              ) : (
                <span className="ml-2 text-amber-800">
                  — pick two runs with <code className="rounded bg-amber-100 px-0.5">fullText</code> (see diff tab), or use
                  overrides below
                </span>
              )}
            </p>
            {compareChunkChanges.length > 0 ? (
              <p className="mt-1.5 text-[11px] text-zinc-600">
                <strong className="text-zinc-700">Embedding delta:</strong>{" "}
                {compareChunkChanges.length} added/removed chunk excerpt
                {compareChunkChanges.length === 1 ? "" : "s"} from the <strong>current</strong> ingest will be included
                in <code className="rounded bg-white px-1 font-mono text-[10px]">compare_context.chunk_changes</code> for
                side-by-side / compare questions.
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] text-zinc-500">
                No added/removed chunk list on the current run — compare still uses full-text line diff only.
              </p>
            )}
          </div>
          <p className="text-[11px] text-zinc-500">
            <strong>Override (optional):</strong> if Compare ingests are incomplete, paste two full bodies here (each ≥ 8
            characters) to supply <code className="rounded bg-zinc-100 px-1 font-mono text-[10px]">compare_context</code>{" "}
            manually.
          </p>
          <textarea
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[11px] text-zinc-900"
            rows={2}
            placeholder="Manual baseline override…"
            value={agenticBaseline}
            onChange={(e) => setAgenticBaseline(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[11px] text-zinc-900"
            rows={2}
            placeholder="Manual current override…"
            value={agenticCurrent}
            onChange={(e) => setAgenticCurrent(e.target.value)}
          />
          <label className="block text-xs font-medium text-zinc-600">
            Optional summary_context (JSON) for ingest-delta SummaryAgent
            <textarea
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-[11px] text-zinc-900"
              rows={3}
              value={agenticSummaryJson}
              onChange={(e) => setAgenticSummaryJson(e.target.value)}
            />
          </label>
        </div>
      </details>

      <div
        ref={scrollRef}
        className="flex min-h-[14rem] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50/90 to-white p-4 shadow-inner ring-1 ring-zinc-100"
      >
        {messages.length === 0 ? (
          <div className="m-auto max-w-md text-center">
            <p className="text-sm font-medium text-zinc-700">Start a conversation</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Try: &quot;What are the main obligations?&quot;, &quot;Summarize the changes&quot;, or &quot;What filing deadlines apply?&quot;
            </p>
          </div>
        ) : (
          messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="flex justify-end">
                <div className="max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm">
                  {msg.text}
                </div>
              </div>
            ) : (
              <div key={msg.id} className="flex justify-start">
                <div className="max-w-[min(100%,36rem)] rounded-2xl rounded-bl-md border border-zinc-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-100/80">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Assistant</div>
                  {formatAssistantBody(msg.data)}
                  {msg.data.debug_trace && Object.keys(msg.data.debug_trace).length > 0 ? (
                    <details className="mt-2 border-t border-violet-100 pt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-violet-700 hover:text-violet-900">
                        Workflow trace (debug)
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-violet-200/80 bg-violet-50/50 p-2 text-[10px] leading-relaxed text-violet-950">
                        {JSON.stringify(msg.data.debug_trace, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  {msg.data.comparison?.debug_meta && Object.keys(msg.data.comparison.debug_meta).length > 0 ? (
                    <details className="mt-2 border-t border-sky-100 pt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-sky-800 hover:text-sky-950">
                        Compare agent stats (debug_meta)
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-sky-200/80 bg-sky-50/50 p-2 text-[10px] leading-relaxed text-sky-950">
                        {JSON.stringify(msg.data.comparison.debug_meta, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  <details className="mt-3 border-t border-zinc-100 pt-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-zinc-500 hover:text-zinc-700">
                      Raw JSON
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-zinc-900/95 p-2 text-[10px] leading-relaxed text-zinc-100">
                      {msg.raw}
                    </pre>
                  </details>
                </div>
              </div>
            ),
          )
        )}
        {busy ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                Thinking…
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-100">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-medium text-zinc-600">
            Message
            <textarea
              className="mt-1 min-h-[3rem] w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
              rows={2}
              placeholder="Ask about this document…"
              value={draft}
              disabled={!proxyOn || !documentUrl || busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendChat();
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={!proxyOn || !documentUrl || busy || !draft.trim()}
            onClick={() => void sendChat()}
            className="shrink-0 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">Enter to send · Shift+Enter for newline</p>
      </div>

      <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm ring-1 ring-zinc-100 [&_summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50/80">
          Diagnostics and raw endpoints
        </summary>
        <div className="space-y-5 border-t border-zinc-100 px-4 pb-4 pt-2">
          <p className="text-xs text-zinc-500">
            Optional tools for debugging the BFF proxy, <code className="rounded bg-zinc-100 px-1">/v1/orchestrate</code>
            , and n8n <code className="rounded bg-zinc-100 px-1">/v1/pipelines/chat</code>.
          </p>
          {agentsHealth != null ? (
            <pre className="max-h-36 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-[11px] text-zinc-800">
              {JSON.stringify(agentsHealth, null, 2)}
            </pre>
          ) : (
            <p className="text-[11px] text-zinc-400">Ping agents above to load health JSON.</p>
          )}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">POST /api/agents/v1/orchestrate</h3>
            <textarea
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              rows={2}
              value={orchMsg}
              onChange={(e) => setOrchMsg(e.target.value)}
            />
            <button
              type="button"
              disabled={!proxyOn || busy}
              onClick={() => void runOrchestrate()}
              className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              Run orchestrate
            </button>
            {orchOut ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-zinc-900 p-2 text-[10px] text-zinc-100">{orchOut}</pre>
            ) : null}
          </div>
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">POST /api/agents/v1/pipelines/chat</h3>
            <label className="mt-2 flex items-start gap-2 text-xs text-zinc-600">
              <input type="checkbox" checked={chatForceQna} onChange={(e) => setChatForceQna(e.target.checked)} />
              force_qna
            </label>
            <textarea
              className="mt-2 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              rows={2}
              value={qnaQ}
              onChange={(e) => setQnaQ(e.target.value)}
            />
            <button
              type="button"
              disabled={!proxyOn || !documentUrl || busy}
              onClick={() => void runQna()}
              className="mt-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40"
            >
              Run chat pipeline
            </button>
            {qnaOut ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-zinc-900 p-2 text-[10px] text-zinc-100">{qnaOut}</pre>
            ) : null}
          </div>
        </div>
      </details>

      {err ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{err}</div>
      ) : null}
    </div>
  );
}
