import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AssistantResponseAvatar, UserQueryAvatar } from "./chat/ChatRoleAvatars";
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
  suggested_followups?: string[];
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

function AssistantWelcomeIntro({
  isDock,
  documentUrl,
  proxyOn,
}: {
  isDock: boolean;
  documentUrl: string;
  proxyOn: boolean;
}) {
  const titleCls = isDock ? "text-[15px] font-semibold leading-snug text-zinc-900" : "text-base font-semibold text-zinc-900";
  const bodyCls = isDock ? "text-[13px] leading-relaxed text-zinc-800" : "text-sm leading-relaxed text-zinc-800";
  const listCls = isDock ? "mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-zinc-800" : "mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-800";
  const footCls = isDock ? "mt-3 text-[12px] leading-relaxed text-zinc-600" : "mt-3 text-xs leading-relaxed text-zinc-600";

  const bubble =
    isDock
      ? "min-w-0 max-w-[min(100%,calc(100%-2.75rem))] rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-3.5 py-3 shadow-md ring-1 ring-zinc-200/60"
      : "min-w-0 max-w-[min(100%,40rem)] rounded-2xl rounded-bl-md border border-zinc-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-100/80";

  return (
    <div className="flex justify-start gap-2">
      <span className="shrink-0 self-start pt-1">
        <AssistantResponseAvatar size={isDock ? "md" : "sm"} />
      </span>
      <div className={bubble}>
        <p className={titleCls}>Hi — I&apos;m your regulatory assistant.</p>
        <p className={`mt-2 ${bodyCls}`}>
          I help you work with the <strong className="font-semibold text-zinc-900">indexed PDF runs</strong> for this
          product: ask grounded questions, compare ingests, and interpret change signals — without replacing your own
          legal review.
        </p>
        {documentUrl ? (
          <p className={`mt-2 ${isDock ? "text-[12px]" : "text-xs"} leading-snug text-zinc-600`}>
            <span className="font-semibold text-zinc-700">Current scope: </span>
            <span className="break-all font-mono text-zinc-800">{documentUrl}</span>
          </p>
        ) : (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-2 py-1.5 text-[12px] text-amber-950">
            Select a run with a document URL to send questions. You can still read this introduction anytime.
          </p>
        )}
        <p className={`mt-2 ${bodyCls}`}>Here is what I can do for you in this app:</p>
        <ul className={listCls}>
          <li>
            <strong className="font-semibold text-zinc-900">Document Q&amp;A</strong> — answer from retrieved chunks for
            the scoped URL, with citations when the model includes them (for example{" "}
            <span className="font-mono text-[12px] text-zinc-700">[chunk:12]</span>).
          </li>
          <li>
            <strong className="font-semibold text-zinc-900">Compare &amp; redline context</strong> — when baseline and
            current full text are available from your ingest/compare workflow, I can route to compare-style narratives.
          </li>
          <li>
            <strong className="font-semibold text-zinc-900">Summaries &amp; materiality hints</strong> — when ingest
            summary context is attached, I can surface delta-style summaries the workflow exposes.
          </li>
          <li>
            <strong className="font-semibold text-zinc-900">Quick orientation</strong> — short replies for greetings or
            &quot;what can you do?&quot; without fabricating obligations from the document.
          </li>
        </ul>
        <p className={`mt-2 ${isDock ? "text-[12px]" : "text-xs"} leading-relaxed text-zinc-600`}>
          I do <strong className="font-medium text-zinc-800">not</strong> provide legal advice. Treat every answer as
          draft analysis tied to the excerpts and runs you scope — verify against source PDFs and your process.
        </p>
        {!proxyOn ? (
          <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50/90 px-2 py-1.5 text-[12px] font-medium text-rose-950">
            Agents API is offline from this browser session. Check the web server&apos;s agents proxy and that the
            agents service is running before sending questions.
          </p>
        ) : null}
        <p className={footCls}>
          <span className="font-semibold text-zinc-700">Try asking: </span>
          &quot;What are the main obligations?&quot;, &quot;What changed between these two ingests?&quot;, or &quot;What
          filing deadlines apply?&quot; — type below and press Enter to send.
        </p>
      </div>
    </div>
  );
}

function formatAssistantBody(data: AgenticJson, dockUi = false): ReactNode {
  const qna = data.qna;
  const summary = data.summary;
  const comp = data.comparison;

  const mt = dockUi ? "mt-2" : "mt-3";
  const mtTight = dockUi ? "mt-1.5" : "mt-2";
  const gapMain = dockUi ? "space-y-3" : "space-y-4";
  const gapSec = dockUi ? "space-y-2.5" : "space-y-3";
  const bodyText = dockUi ? "text-[13px] leading-relaxed" : "text-sm leading-relaxed";
  const labelText = dockUi ? "text-[11px] font-semibold uppercase tracking-wide text-zinc-600" : "text-[11px] font-semibold uppercase tracking-wide text-zinc-500";

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
      <div className={`${mt} rounded-lg border border-rose-200 bg-rose-50/90 px-3 py-2.5 ${bodyText} text-rose-950`}>
        <p className={dockUi ? "text-[11px] font-semibold uppercase tracking-wide text-rose-900" : "text-[11px] font-semibold uppercase tracking-wide text-rose-800"}>
          Blocked
        </p>
        <p className="mt-1">{parseInlineAgentText(data.reason || "This request could not be processed.")}</p>
      </div>
    );
  } else if (data.executed && qna?.answer) {
    const cited = Array.isArray(qna.cited_chunk_indices) ? qna.cited_chunk_indices : [];
    const modelNote = [qna.stub ? "stub response" : null, qna.model_id ? `model ${qna.model_id}` : null]
      .filter(Boolean)
      .join(" · ");
    body = (
      <div className={`${mt} ${gapMain} text-zinc-800`}>
        <div>
          <p className={labelText}>Answer</p>
          <div className={mtTight}>{structureAgentAnswer(qna.answer)}</div>
        </div>
        {cited.length > 0 ? (
          <div>
            <p className={labelText}>Sources (chunks)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cited.map((n) => (
                <span
                  key={n}
                  className="inline-flex items-center rounded-md border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-zinc-800"
                  title="Chunk index cited in the answer"
                >
                  #{n}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {modelNote ? <p className={`${dockUi ? "text-xs" : "text-[11px]"} text-zinc-600`}>{modelNote}</p> : null}
      </div>
    );
  } else if (data.executed && comp) {
    body = (
      <div className={`${mt} ${gapSec} text-zinc-800`}>
        <div>
          <p className={labelText}>Comparison</p>
          {comp.headline ? (
            <p className={`${mtTight} ${dockUi ? "text-[14px]" : "text-sm"} font-semibold leading-snug text-zinc-900`}>{comp.headline}</p>
          ) : null}
        </div>
        {comp.narrative ? (
          <div className={`${dockUi ? "text-[13px]" : "text-[13px]"} leading-relaxed text-zinc-800`}>{structureAgentAnswer(comp.narrative)}</div>
        ) : null}
      </div>
    );
  } else if (data.executed && summary) {
    const llm = summary.llmSummary ?? summary.llm_summary ?? "";
    const mat = summary.materialityNotes ?? summary.materiality_notes ?? "";
    body = (
      <div className={`${mt} ${gapMain} text-zinc-800`}>
        {llm ? (
          <div>
            <p className={labelText}>Summary</p>
            <div className={mtTight}>{structureAgentAnswer(llm)}</div>
          </div>
        ) : null}
        {mat ? (
          <div>
            <p className={labelText}>Materiality</p>
            <div className={`${mtTight} ${dockUi ? "text-[13px]" : "text-[13px]"} leading-relaxed text-zinc-700`}>{structureAgentAnswer(mat)}</div>
          </div>
        ) : null}
      </div>
    );
  } else if (data.needs_input && data.needs_input.length > 0) {
    body = (
      <div className={`${mt} rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5 ${bodyText} text-amber-950`}>
        <p className={dockUi ? "text-[11px] font-semibold uppercase tracking-wide text-amber-950" : "text-[11px] font-semibold uppercase tracking-wide text-amber-900"}>
          More input needed
        </p>
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
      <div className={`${mt} ${bodyText} text-zinc-800`}>
        {parseInlineAgentText(data.reason)}
      </div>
    );
  } else {
    body = <p className={`${mt} ${dockUi ? "text-[13px]" : "text-sm"} text-zinc-600`}>No answer payload in this response.</p>;
  }

  return (
    <div className={dockUi ? "text-[13px] leading-relaxed" : undefined}>
      {metaLine ? (
        <p
          className={dockUi ? "text-[11px] leading-relaxed text-zinc-600" : "text-[11px] leading-relaxed text-zinc-500"}
          title="Supervisor routing and execution"
        >
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
  variant = "panel",
}: {
  documentUrl: string;
  /** From Document tab → Compare ingests: Baseline (older) run `fullText` (same as Readable diff). */
  compareBaselineText?: string;
  /** From Document tab → Compare ingests: Current (newer) run `fullText`. */
  compareCurrentText?: string;
  /** From current run ingest delta: added/removed chunk excerpts (Embedding delta tab). */
  compareChunkChanges?: { kind: "added" | "removed"; chunk_index: number | null; excerpt: string }[];
  /** `dock`: compact chrome for the floating chat; `panel`: full page header (legacy). */
  variant?: "panel" | "dock";
}) {
  const [bffHealth, setBffHealth] = useState<BffHealth | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const isDock = variant === "dock";

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

  useEffect(() => {
    void loadBffHealth();
  }, [loadBffHealth]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const proxyOn = Boolean(bffHealth?.agentsProxy);

  const ingestCompareReady =
    compareBaselineText.trim().length >= 8 && compareCurrentText.trim().length >= 8;

  const sendChat = async () => {
    const text = draft.trim();
    if (!text || !proxyOn) return;
    setErr(null);
    setDraft("");
    const userId = uid();
    setMessages((m) => [...m, { id: userId, role: "user", text }]);
    setBusy(true);

    const chunkPayload = compareChunkChanges.slice(0, 48);
    const compare_context = ingestCompareReady
      ? {
          baseline_text: compareBaselineText,
          current_text: compareCurrentText,
          ...(chunkPayload.length > 0 ? { chunk_changes: chunkPayload } : {}),
        }
      : undefined;

    try {
      const r = await fetch("/api/agents/v1/workflow/agentic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          document_url: documentUrl || undefined,
          qdrant_url: "http://qdrant:6333",
          qdrant_collection: "regulatory_docs",
          qdrant_api_key: "",
          top_k: 8,
          force_qna: true,
          ...(compare_context ? { compare_context } : {}),
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
    compareBaselineText,
    compareCurrentText,
    compareChunkChanges,
  ]);

  return (
    <div
      className={
        isDock
          ? "flex min-h-0 flex-1 flex-col gap-2 overflow-hidden"
          : "flex min-h-[32rem] flex-col gap-4"
      }
    >
      {!isDock ? (
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
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/90 bg-zinc-50/50 pb-2.5 pt-0.5">
          <span
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              proxyOn
                ? "border-emerald-400/80 bg-emerald-50 text-emerald-950"
                : "border-zinc-300 bg-zinc-100 text-zinc-700"
            }`}
          >
            {proxyOn ? "Connected" : "Offline"}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              title="Refresh connection"
              className="min-h-[36px] rounded-lg border border-zinc-300/90 bg-white px-2.5 text-[11px] font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50"
              onClick={() => void loadBffHealth()}
            >
              Refresh
            </button>
            <button
              type="button"
              title="Export JSON"
              disabled={messages.length === 0}
              className="min-h-[36px] rounded-lg border border-zinc-300/90 bg-white px-2.5 text-[11px] font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
              onClick={exportConversationJson}
            >
              JSON
            </button>
            <button
              type="button"
              title="Export transcript"
              disabled={messages.length === 0}
              className="min-h-[36px] rounded-lg border border-zinc-300/90 bg-white px-2.5 text-[11px] font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-40"
              onClick={exportConversationTxt}
            >
              TXT
            </button>
            <button
              type="button"
              title="Clear thread"
              className="min-h-[36px] rounded-lg border border-zinc-300/90 bg-white px-2.5 text-[11px] font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50"
              onClick={clearThread}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {!isDock ? (
        documentUrl ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-[11px] text-zinc-600">
            <span className="font-semibold text-zinc-500">Scope </span>
            <span className="break-all font-mono text-zinc-800">{documentUrl}</span>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Select a run with a document URL to scope questions.
          </div>
        )
      ) : null}

      <div
        ref={scrollRef}
        className={
          isDock
            ? "flex min-h-0 flex-1 basis-0 flex-col gap-3 overflow-y-auto overscroll-y-contain rounded-xl border border-zinc-200 bg-white p-3 shadow-inner ring-1 ring-zinc-100/80"
            : "flex min-h-[14rem] flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-zinc-50/90 to-white p-4 shadow-inner ring-1 ring-zinc-100"
        }
      >
        {messages.length === 0 ? (
          <AssistantWelcomeIntro isDock={isDock} documentUrl={documentUrl} proxyOn={proxyOn} />
        ) : (
          messages.map((msg) =>
            msg.role === "user" ? (
              <div key={msg.id} className="flex justify-end gap-2">
                <div
                  className={
                    isDock
                      ? "max-w-[min(100%,calc(100%-2.75rem))] rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2.5 text-[14px] leading-relaxed text-white shadow-md"
                      : "max-w-[min(100%,28rem)] rounded-2xl rounded-br-md bg-emerald-600 px-4 py-2.5 text-sm leading-relaxed text-white shadow-sm"
                  }
                >
                  {msg.text}
                </div>
                <span className="shrink-0 self-end pt-0.5">
                  <UserQueryAvatar size={isDock ? "md" : "sm"} />
                </span>
              </div>
            ) : (
              <div key={msg.id} className="flex justify-start gap-2">
                <span className="shrink-0 self-start pt-1">
                  <AssistantResponseAvatar size={isDock ? "md" : "sm"} />
                </span>
                <div
                  className={
                    isDock
                      ? "min-w-0 max-w-[min(100%,calc(100%-2.75rem))] rounded-2xl rounded-bl-md border border-zinc-200 bg-white px-3.5 py-3 shadow-md ring-1 ring-zinc-200/60"
                      : "min-w-0 max-w-[min(100%,36rem)] rounded-2xl rounded-bl-md border border-zinc-200/90 bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-100/80"
                  }
                >
                  {formatAssistantBody(msg.data, isDock)}
                  {Array.isArray(msg.data.suggested_followups) && msg.data.suggested_followups.length > 0 ? (
                    isDock ? (
                      <div className="mt-3 rounded-xl border border-emerald-200/80 bg-emerald-50/90 p-2.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-950">Suggested next</p>
                        <ul className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-0.5">
                          {msg.data.suggested_followups.map((s) => (
                            <li key={s}>
                              <button
                                type="button"
                                disabled={!proxyOn || !documentUrl || busy}
                                className="w-full rounded-lg border border-emerald-300/70 bg-white px-3 py-2.5 text-left text-[13px] font-normal leading-snug text-zinc-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50/80 disabled:cursor-not-allowed disabled:opacity-40"
                                title="Use as your next message"
                                onClick={() => setDraft(s)}
                              >
                                {s}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-3 border-t border-zinc-100 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">You might ask next</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.data.suggested_followups.map((s) => (
                            <button
                              key={s}
                              type="button"
                              disabled={!proxyOn || !documentUrl || busy}
                              className="max-w-full rounded-full border border-emerald-200/90 bg-emerald-50/80 px-3 py-1.5 text-left text-[12px] leading-snug text-emerald-950 hover:bg-emerald-100/90 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Insert into message box"
                              onClick={() => setDraft(s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  ) : null}
                  {msg.data.debug_trace && Object.keys(msg.data.debug_trace).length > 0 ? (
                    <details className={`mt-2 border-t border-violet-100 ${isDock ? "pt-1.5" : "pt-2"}`}>
                      <summary
                        className={
                          isDock
                            ? "cursor-pointer text-xs font-semibold text-violet-900 hover:text-violet-950"
                            : "cursor-pointer text-[11px] font-medium text-violet-700 hover:text-violet-900"
                        }
                      >
                        Workflow trace (debug)
                      </summary>
                      <pre
                        className={
                          isDock
                            ? "mt-2 max-h-40 overflow-auto rounded-lg border border-violet-200/80 bg-violet-50/50 p-2 text-[11px] leading-relaxed text-violet-950"
                            : "mt-2 max-h-64 overflow-auto rounded-lg border border-violet-200/80 bg-violet-50/50 p-2 text-[10px] leading-relaxed text-violet-950"
                        }
                      >
                        {JSON.stringify(msg.data.debug_trace, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  {msg.data.comparison?.debug_meta && Object.keys(msg.data.comparison.debug_meta).length > 0 ? (
                    <details className={`mt-2 border-t border-sky-100 ${isDock ? "pt-1.5" : "pt-2"}`}>
                      <summary
                        className={
                          isDock
                            ? "cursor-pointer text-xs font-semibold text-sky-950 hover:text-sky-950"
                            : "cursor-pointer text-[11px] font-medium text-sky-800 hover:text-sky-950"
                        }
                      >
                        Compare agent stats (debug_meta)
                      </summary>
                      <pre
                        className={
                          isDock
                            ? "mt-2 max-h-36 overflow-auto rounded-lg border border-sky-200/80 bg-sky-50/50 p-2 text-[11px] leading-relaxed text-sky-950"
                            : "mt-2 max-h-48 overflow-auto rounded-lg border border-sky-200/80 bg-sky-50/50 p-2 text-[10px] leading-relaxed text-sky-950"
                        }
                      >
                        {JSON.stringify(msg.data.comparison.debug_meta, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                  <details className={`mt-3 border-t border-zinc-200/80 ${isDock ? "pt-1.5" : "pt-2"}`}>
                    <summary
                      className={
                        isDock
                          ? "cursor-pointer text-xs font-semibold text-zinc-700 hover:text-zinc-900"
                          : "cursor-pointer text-[11px] font-medium text-zinc-500 hover:text-zinc-700"
                      }
                    >
                      Raw response (JSON)
                    </summary>
                    <pre
                      className={
                        isDock
                          ? "mt-2 max-h-36 overflow-auto rounded-lg bg-zinc-900 p-2.5 text-[11px] leading-relaxed text-zinc-100"
                          : "mt-2 max-h-48 overflow-auto rounded-lg bg-zinc-900/95 p-2 text-[10px] leading-relaxed text-zinc-100"
                      }
                    >
                      {msg.raw}
                    </pre>
                  </details>
                </div>
              </div>
            ),
          )
        )}
        {busy ? (
          <div className="flex justify-start gap-2">
            <span className="shrink-0 self-start pt-1">
              <AssistantResponseAvatar size={isDock ? "md" : "sm"} />
            </span>
            <div
              className={
                isDock
                  ? "rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[14px] text-zinc-600 shadow-sm"
                  : "rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm"
              }
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />
                Thinking…
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={
          isDock
            ? "shrink-0 rounded-xl border border-zinc-200 bg-zinc-50/60 p-2.5 shadow-sm ring-1 ring-zinc-100"
            : "rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm ring-1 ring-zinc-100"
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-medium text-zinc-600">
            {isDock ? <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Your message</span> : "Message"}
            <textarea
              className={
                isDock
                  ? "min-h-[3.25rem] w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  : "mt-1 min-h-[3rem] w-full resize-y rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
              }
              rows={isDock ? 2 : 2}
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
            className={
              isDock
                ? "shrink-0 rounded-lg bg-emerald-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-md hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                : "shrink-0 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            }
          >
            Send
          </button>
        </div>
        {!isDock ? (
          <p className="mt-2 text-[11px] text-zinc-500">Enter to send · Shift+Enter for newline</p>
        ) : (
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">Enter to send · Shift+Enter for newline</p>
        )}
      </div>

      {err ? (
        <div
          className={
            isDock
              ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium leading-snug text-red-950"
              : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          }
        >
          {err}
        </div>
      ) : null}
    </div>
  );
}
