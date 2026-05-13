"""Supervisor-driven workflow: classify intent, dispatch to Summary / Compare / QnA agents."""

from __future__ import annotations

import re
from typing import Any

from app.agents.compare import run_compare_agent
from app.agents.guardrails import validate_guardrails
from app.agents.summary import run_summary_agent
from app.agents.supervisor import classify_intent_async
from app.pipelines.retrieve_qna import retrieve_and_answer
from app.schemas import (
    AgenticWorkflowRequest,
    AgenticWorkflowResponse,
    CompareAgentRequest,
    GuardrailsValidateRequest,
    OrchestrateRequest,
)

# Compare-style phrasing that needs two full texts (or the product diff UI) — do not fake via QnA-only retrieval.
_FULL_TEXT_COMPARE_QUERY = re.compile(
    r"(?i)(side[\s-]by[\s-]side|side by side|two[\s-]column|adjacent columns|redline|full[\s-]text[\s-](diff|compare)|"
    r"diff[\s-]view|column[\s-]by[\s-]column)"
)

# When baseline+current full texts are already on the request, these questions should run CompareAgent
# even if the supervisor picks qna (LLM rules often steer "differences" to RAG).
_COMPARE_WHEN_BOTH_TEXTS = re.compile(
    r"(?i)(\bcompared\s+to\b|\bcompared\s+with\b|\bmain\s+differences\b|\bkey\s+differences\b|\bdifferences\s+between\b|"
    r"\bredline\b|"
    r"\b(modified|amended|current|draft)\s+version\b.{0,200}\b(differences?|changes?)\b|"
    r"\b(differences?|changes?)\b.{0,200}\b(modified|amended|current|draft)\s+version\b|"
    r"\bofficial\b.{0,200}\b(differences?|changes?|compare|diff)\b|"
    r"\b(differences?|changes?|compare|diff)\b.{0,200}\bofficial\b)"
)


def _requires_full_text_compare(query: str) -> bool:
    return bool(_FULL_TEXT_COMPARE_QUERY.search(query))


def _compare_context_diff_question(query: str) -> bool:
    q = query.strip()
    if _FULL_TEXT_COMPARE_QUERY.search(q):
        return True
    return bool(_COMPARE_WHEN_BOTH_TEXTS.search(q))


def _finalize(resp: AgenticWorkflowResponse, trace: dict[str, Any] | None, debug: bool) -> AgenticWorkflowResponse:
    if not debug or trace is None:
        return resp
    return resp.model_copy(update={"debug_trace": trace})


async def _finish_qna_from_retrieval(
    body: AgenticWorkflowRequest,
    *,
    supervisor_route: str,
    fallback_from: str | None,
    trace: dict[str, Any] | None = None,
) -> AgenticWorkflowResponse:
    if not body.document_url:
        return _finalize(
            AgenticWorkflowResponse(
                intent="qna",
                intent_id=3,
                supervisor_route=supervisor_route,
                blocked=True,
                reason="missing_document_url_for_qna",
                executed=False,
                needs_input=["document_url"],
                fallback_from=fallback_from,
            ),
            trace,
            body.debug,
        )

    if trace is not None:
        trace["retrieve_qna"] = {
            "document_url": body.document_url,
            "qdrant_collection": body.qdrant_collection,
            "top_k": body.top_k,
        }

    outcome, qna_ans, out_reason = await retrieve_and_answer(
        message=body.query,
        document_url=body.document_url,
        qdrant_url=body.qdrant_url,
        qdrant_collection=body.qdrant_collection,
        qdrant_api_key=body.qdrant_api_key,
        top_k=body.top_k,
    )
    if trace is not None:
        trace["retrieve_qna"]["outcome"] = outcome

    if outcome == "no_chunks":
        return _finalize(
            AgenticWorkflowResponse(
                intent="qna",
                intent_id=3,
                supervisor_route=supervisor_route,
                executed=False,
                needs_input=["indexed_chunks_for_document_url"],
                reason="no_chunks_in_qdrant",
                fallback_from=fallback_from,
            ),
            trace,
            body.debug,
        )
    if outcome == "output_blocked":
        return _finalize(
            AgenticWorkflowResponse(
                intent="qna",
                intent_id=3,
                supervisor_route=supervisor_route,
                blocked=True,
                reason=out_reason,
                executed=False,
                fallback_from=fallback_from,
            ),
            trace,
            body.debug,
        )
    if trace is not None and qna_ans is not None:
        trace["retrieve_qna"]["cited_chunk_indices"] = list(qna_ans.cited_chunk_indices)
        trace["retrieve_qna"]["answer_chars"] = len(qna_ans.answer)
        trace["retrieve_qna"]["qna_stub"] = qna_ans.stub
    return _finalize(
        AgenticWorkflowResponse(
            intent="qna",
            intent_id=3,
            supervisor_route=supervisor_route,
            executed=True,
            qna=qna_ans,
            fallback_from=fallback_from,
        ),
        trace,
        body.debug,
    )


async def run_agentic_workflow(body: AgenticWorkflowRequest) -> AgenticWorkflowResponse:
    trace: dict[str, Any] | None = {} if body.debug else None
    if trace is not None:
        trace["request"] = {
            "query_preview": body.query[:800],
            "document_url": body.document_url,
            "top_k": body.top_k,
            "qdrant_collection": body.qdrant_collection,
            "has_compare_context": body.compare_context is not None,
            "has_summary_context": body.summary_context is not None,
        }
        if body.compare_context is not None:
            trace["request"]["compare_baseline_chars"] = len(body.compare_context.baseline_text)
            trace["request"]["compare_current_chars"] = len(body.compare_context.current_text)
            trace["request"]["compare_chunk_changes_count"] = len(body.compare_context.chunk_changes)

    g0 = validate_guardrails(
        GuardrailsValidateRequest(phase="input", text=body.query, require_chunk_citations=False)
    )
    if not g0.allowed:
        if trace is not None:
            trace["guardrails"] = {"phase": "input", "allowed": False, "reason": g0.reason}
        return _finalize(
            AgenticWorkflowResponse(
                intent="blocked",
                intent_id=0,
                supervisor_route="blocked",
                blocked=True,
                reason=g0.reason,
                executed=False,
                needs_input=[],
            ),
            trace,
            body.debug,
        )

    if (
        not body.force_qna
        and body.compare_context is not None
        and _compare_context_diff_question(body.query)
    ):
        if trace is not None:
            trace["orchestrate"] = {"route": "compare", "reason": "shortcut_full_texts_and_diff_question"}
            trace["branch"] = "compare_with_full_context"
            trace["compare_shortcut"] = True
            trace["compare_context"] = {
                "baseline_chars": len(body.compare_context.baseline_text),
                "current_chars": len(body.compare_context.current_text),
                "max_chars": body.compare_context.max_chars,
                "chunk_changes_count": len(body.compare_context.chunk_changes),
            }
        cmp_req = CompareAgentRequest(
            baseline_text=body.compare_context.baseline_text,
            current_text=body.compare_context.current_text,
            max_chars=body.compare_context.max_chars,
            chunk_changes=list(body.compare_context.chunk_changes),
            user_question=body.query.strip() or None,
            debug=body.debug,
        )
        comparison = await run_compare_agent(cmp_req)
        if trace is not None and comparison.debug_meta is not None:
            trace["compare_agent"] = comparison.debug_meta
        return _finalize(
            AgenticWorkflowResponse(
                intent="comparison",
                intent_id=2,
                supervisor_route="compare",
                executed=True,
                comparison=comparison,
            ),
            trace,
            body.debug,
        )

    orch = await classify_intent_async(OrchestrateRequest(user_message=body.query, document_url=body.document_url))
    if trace is not None:
        trace["orchestrate"] = {"route": orch.route, "reason": orch.reason}

    if orch.route == "blocked":
        if body.document_url and body.query.strip() and (orch.reason or "") != "empty_message":
            if trace is not None:
                trace["branch"] = "blocked_fallback_qna"
            return await _finish_qna_from_retrieval(body, supervisor_route="blocked", fallback_from="blocked", trace=trace)
        if trace is not None:
            trace["branch"] = "blocked_hard"
        return _finalize(
            AgenticWorkflowResponse(
                intent="blocked",
                intent_id=0,
                supervisor_route="blocked",
                blocked=True,
                reason=orch.reason,
                executed=False,
                needs_input=[],
            ),
            trace,
            body.debug,
        )

    if orch.route == "compare":
        if body.force_qna and body.document_url:
            if trace is not None:
                trace["branch"] = "compare_force_qna"
            return await _finish_qna_from_retrieval(
                body, supervisor_route="compare", fallback_from="compare", trace=trace
            )
        if body.compare_context is not None:
            if trace is not None:
                trace["branch"] = "compare_with_full_context"
                trace["compare_context"] = {
                    "baseline_chars": len(body.compare_context.baseline_text),
                    "current_chars": len(body.compare_context.current_text),
                    "max_chars": body.compare_context.max_chars,
                    "chunk_changes_count": len(body.compare_context.chunk_changes),
                }
            cmp_req = CompareAgentRequest(
                baseline_text=body.compare_context.baseline_text,
                current_text=body.compare_context.current_text,
                max_chars=body.compare_context.max_chars,
                chunk_changes=list(body.compare_context.chunk_changes),
                user_question=body.query.strip() or None,
                debug=body.debug,
            )
            comparison = await run_compare_agent(cmp_req)
            if trace is not None and comparison.debug_meta is not None:
                trace["compare_agent"] = comparison.debug_meta
            return _finalize(
                AgenticWorkflowResponse(
                    intent="comparison",
                    intent_id=2,
                    supervisor_route="compare",
                    executed=True,
                    comparison=comparison,
                ),
                trace,
                body.debug,
            )
        if body.document_url:
            if _requires_full_text_compare(body.query):
                if trace is not None:
                    trace["branch"] = "compare_needs_context_side_by_side_query"
                    trace["needs_compare_context"] = True
                return _finalize(
                    AgenticWorkflowResponse(
                        intent="comparison",
                        intent_id=2,
                        supervisor_route="compare",
                        executed=False,
                        needs_input=["compare_context.baseline_text", "compare_context.current_text"],
                        reason=(
                            "Side-by-side or redline of two full document bodies needs baseline + current text in "
                            "compare_context, or use the web **Readable diff** tab when two runs are selected."
                        ),
                    ),
                    trace,
                    body.debug,
                )
            if trace is not None:
                trace["branch"] = "compare_fallback_qna_keyword_not_side_by_side"
            return await _finish_qna_from_retrieval(body, supervisor_route="compare", fallback_from="compare", trace=trace)
        if trace is not None:
            trace["branch"] = "compare_needs_context_no_document_url"
        return _finalize(
            AgenticWorkflowResponse(
                intent="comparison",
                intent_id=2,
                supervisor_route="compare",
                executed=False,
                needs_input=["compare_context.baseline_text", "compare_context.current_text"],
            ),
            trace,
            body.debug,
        )

    if orch.route == "summary":
        if body.force_qna and body.document_url:
            if trace is not None:
                trace["branch"] = "summary_force_qna"
            return await _finish_qna_from_retrieval(
                body, supervisor_route="summary", fallback_from="summary", trace=trace
            )
        if body.summary_context is not None:
            if trace is not None:
                trace["branch"] = "summary_with_context"
            summary = await run_summary_agent(body.summary_context)
            return _finalize(
                AgenticWorkflowResponse(
                    intent="summary",
                    intent_id=1,
                    supervisor_route="summary",
                    executed=True,
                    summary=summary,
                ),
                trace,
                body.debug,
            )
        if body.document_url:
            if trace is not None:
                trace["branch"] = "summary_fallback_qna"
            return await _finish_qna_from_retrieval(body, supervisor_route="summary", fallback_from="summary", trace=trace)
        if trace is not None:
            trace["branch"] = "summary_needs_summary_context"
        return _finalize(
            AgenticWorkflowResponse(
                intent="summary",
                intent_id=1,
                supervisor_route="summary",
                executed=False,
                needs_input=[
                    "summary_context (SummaryAgentRequest: run_point_id, document_url, version_id, summary, previews)",
                ],
            ),
            trace,
            body.debug,
        )

    if trace is not None:
        trace["branch"] = "qna_primary"
    return await _finish_qna_from_retrieval(body, supervisor_route="qna", fallback_from=None, trace=trace)
