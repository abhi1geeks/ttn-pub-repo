"""Supervisor-driven workflow: classify intent, dispatch to Summary / Compare / QnA agents.

Two execution engines are available, selected by `WORKFLOW_ENGINE`:

- `langgraph` (default): runs `app.agents.workflow_graph.run_agentic_workflow_graph`.
- `legacy`: runs the hand-rolled async implementation below (`_run_agentic_workflow_legacy`).

Both paths produce the same `AgenticWorkflowResponse` (including `debug_trace` shape).
The legacy path is retained as an escape hatch and is exercised by the existing tests.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from app.agents.compare import run_compare_agent
from app.agents.guardrails import first_agentic_input_policy_violation
from app.agents.routing_signals import (
    compare_cross_version_question,
    requires_full_text_compare_presentation,
)
from app.agents.summary import run_summary_agent
from app.agents.supervisor import classify_intent_async
from app.pipelines.chat_triage import trivial_chat_reply
from app.pipelines.followup_suggestions import build_suggested_followups
from app.pipelines.retrieve_qna import retrieve_and_answer
from app.schemas import (
    AgenticWorkflowRequest,
    AgenticWorkflowResponse,
    CompareAgentRequest,
    OrchestrateRequest,
    OrchestrateResponse,
    QnAAgentResponse,
)

logger = logging.getLogger(__name__)

_WORKFLOW_ENGINE_LANGGRAPH = "langgraph"
_WORKFLOW_ENGINE_LEGACY = "legacy"


def agentic_request_debug_snapshot(body: AgenticWorkflowRequest) -> dict[str, Any]:
    """Request fields copied into `debug_trace.request` for agentic workflow (legacy + LangGraph)."""
    out: dict[str, Any] = {
        "query_preview": body.query[:800],
        "document_url": body.document_url,
        "top_k": body.top_k,
        "qdrant_collection": body.qdrant_collection,
        "has_compare_context": body.compare_context is not None,
        "has_summary_context": body.summary_context is not None,
    }
    if body.compare_context is not None:
        out["compare_baseline_chars"] = len(body.compare_context.baseline_text)
        out["compare_current_chars"] = len(body.compare_context.current_text)
        out["compare_chunk_changes_count"] = len(body.compare_context.chunk_changes)
    return out


def _finalize(
    resp: AgenticWorkflowResponse,
    trace: dict[str, Any] | None,
    body: AgenticWorkflowRequest,
) -> AgenticWorkflowResponse:
    updates: dict[str, Any] = {"suggested_followups": build_suggested_followups(body, resp)}
    if body.debug and trace is not None:
        updates["debug_trace"] = trace
    return resp.model_copy(update=updates)


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
            body,
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
            body,
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
            body,
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
        body,
    )


def _selected_engine() -> str:
    """Pick the orchestration engine.

    Default is `langgraph`. Any unrecognized value falls back to `legacy` and is logged.
    """
    raw = os.environ.get("WORKFLOW_ENGINE", _WORKFLOW_ENGINE_LANGGRAPH).strip().lower()
    if raw in (_WORKFLOW_ENGINE_LANGGRAPH, _WORKFLOW_ENGINE_LEGACY):
        return raw
    logger.warning("WORKFLOW_ENGINE=%r is not recognized; using legacy engine.", raw)
    return _WORKFLOW_ENGINE_LEGACY


async def run_agentic_workflow(body: AgenticWorkflowRequest) -> AgenticWorkflowResponse:
    """Dispatch to the configured engine (LangGraph by default).

    Both engines must produce the same `AgenticWorkflowResponse` for a given input.
    """
    if _selected_engine() == _WORKFLOW_ENGINE_LANGGRAPH:
        # Imported lazily to avoid a circular import (workflow_graph references
        # this module to honor test monkeypatches on classify_intent_async /
        # retrieve_and_answer / _finish_qna_from_retrieval).
        from app.agents.workflow_graph import run_agentic_workflow_graph

        return await run_agentic_workflow_graph(body)
    return await _run_agentic_workflow_legacy(body)


async def _run_agentic_workflow_legacy(body: AgenticWorkflowRequest) -> AgenticWorkflowResponse:
    trace: dict[str, Any] | None = {} if body.debug else None
    if trace is not None:
        trace["request"] = agentic_request_debug_snapshot(body)

    viol = first_agentic_input_policy_violation(body)
    if viol is not None:
        if trace is not None:
            trace["guardrails"] = {"phase": "input", "allowed": False, "reason": viol}
        return _finalize(
            AgenticWorkflowResponse(
                intent="blocked",
                intent_id=0,
                supervisor_route="blocked",
                blocked=True,
                reason=viol,
                executed=False,
                needs_input=[],
            ),
            trace,
            body,
        )

    canned = trivial_chat_reply(body.query, user_display_name=body.user_display_name)
    if canned is not None:
        if trace is not None:
            trace["branch"] = "conversational_short_circuit"
        return _finalize(
            AgenticWorkflowResponse(
                intent="qna",
                intent_id=3,
                supervisor_route="conversational",
                executed=True,
                qna=QnAAgentResponse(
                    answer=canned,
                    cited_chunk_indices=[],
                    model_id="none",
                    stub=False,
                ),
            ),
            trace,
            body,
        )

    orch = await classify_intent_async(
        OrchestrateRequest(
            user_message=body.query,
            document_url=body.document_url,
            full_compare_texts_attached=body.compare_context is not None,
            ingest_delta_context_attached=body.summary_context is not None,
        )
    )
    if (
        body.compare_context is not None
        and compare_cross_version_question(body.query)
        and (not body.force_qna or requires_full_text_compare_presentation(body.query))
        and orch.route != "blocked"
    ):
        orch = OrchestrateResponse(route="compare", reason="full_text_attachment_intent")
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
            body,
        )

    if orch.route == "compare":
        # Prefer full-text CompareAgent when context is present, even if force_qna is on, for explicit
        # side-by-side / page-wise / redline phrasing (matches pre-orchestrator shortcut).
        if body.compare_context is not None and (
            not body.force_qna or requires_full_text_compare_presentation(body.query)
        ):
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
                body,
            )
        if body.force_qna and body.document_url:
            if trace is not None:
                trace["branch"] = "compare_force_qna"
            return await _finish_qna_from_retrieval(
                body, supervisor_route="compare", fallback_from="compare", trace=trace
            )
        if body.document_url:
            if requires_full_text_compare_presentation(body.query):
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
                    body,
                )
            if trace is not None:
                trace["branch"] = "compare_fallback_qna_not_full_text_presentation"
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
            body,
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
                body,
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
            body,
        )

    if trace is not None:
        trace["branch"] = "qna_primary"
    return await _finish_qna_from_retrieval(body, supervisor_route="qna", fallback_from=None, trace=trace)
