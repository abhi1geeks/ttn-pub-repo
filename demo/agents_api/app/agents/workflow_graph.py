"""LangGraph orchestration for /v1/workflow/agentic.

Engine selected by `WORKFLOW_ENGINE` env in app.agents.agentic_workflow.
Behavior preserved: same AgenticWorkflowResponse and same `debug_trace.branch`
strings as the legacy implementation, so existing tests and clients are unaffected.

Nodes resolve `classify_intent_async` and `retrieve_and_answer` through the
`agentic_workflow` module so that `monkeypatch.setattr("app.agents.agentic_workflow.<name>", ...)`
in tests continues to apply.
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.compare import run_compare_agent
from app.agents.agentic_workflow import _finalize, agentic_request_debug_snapshot
from app.agents.guardrails import first_agentic_input_policy_violation
from app.agents.routing_signals import (
    compare_cross_version_question,
    requires_full_text_compare_presentation,
)
from app.agents.summary import run_summary_agent
from app.pipelines.chat_triage import trivial_chat_reply
from app.schemas import (
    AgenticWorkflowRequest,
    AgenticWorkflowResponse,
    CompareAgentRequest,
    OrchestrateRequest,
    OrchestrateResponse,
    QnAAgentResponse,
)

# Branch identifiers mirror the legacy `trace["branch"]` strings exactly.
_BRANCH_BLOCKED_INPUT = "blocked_input"
_BRANCH_BLOCKED_HARD = "blocked_hard"
_BRANCH_BLOCKED_FALLBACK_QNA = "blocked_fallback_qna"
_BRANCH_COMPARE_FULL = "compare_with_full_context"
_BRANCH_COMPARE_FORCE_QNA = "compare_force_qna"
_BRANCH_COMPARE_FALLBACK_QNA = "compare_fallback_qna_not_full_text_presentation"
_BRANCH_COMPARE_NEEDS_SXS = "compare_needs_context_side_by_side_query"
_BRANCH_COMPARE_NEEDS_NO_DOC = "compare_needs_context_no_document_url"
_BRANCH_SUMMARY_FORCE_QNA = "summary_force_qna"
_BRANCH_SUMMARY_WITH_CONTEXT = "summary_with_context"
_BRANCH_SUMMARY_FALLBACK_QNA = "summary_fallback_qna"
_BRANCH_SUMMARY_NEEDS = "summary_needs_summary_context"
_BRANCH_QNA_PRIMARY = "qna_primary"
_BRANCH_CONVERSATIONAL = "conversational_short_circuit"

_QNA_BRANCHES = frozenset(
    {
        _BRANCH_BLOCKED_FALLBACK_QNA,
        _BRANCH_COMPARE_FORCE_QNA,
        _BRANCH_COMPARE_FALLBACK_QNA,
        _BRANCH_SUMMARY_FORCE_QNA,
        _BRANCH_SUMMARY_FALLBACK_QNA,
        _BRANCH_QNA_PRIMARY,
    }
)
_NEEDS_INPUT_BRANCHES = frozenset(
    {
        _BRANCH_COMPARE_NEEDS_SXS,
        _BRANCH_COMPARE_NEEDS_NO_DOC,
        _BRANCH_SUMMARY_NEEDS,
    }
)
_BLOCKED_BRANCHES = frozenset({_BRANCH_BLOCKED_INPUT, _BRANCH_BLOCKED_HARD})


class WorkflowState(TypedDict, total=False):
    request: AgenticWorkflowRequest
    trace: dict[str, Any] | None
    orch: OrchestrateResponse
    branch: str
    response: AgenticWorkflowResponse


def _decide_branch(body: AgenticWorkflowRequest, orch: OrchestrateResponse) -> str:
    if orch.route == "blocked":
        if body.document_url and body.query.strip() and (orch.reason or "") != "empty_message":
            return _BRANCH_BLOCKED_FALLBACK_QNA
        return _BRANCH_BLOCKED_HARD
    if orch.route == "compare":
        if body.compare_context is not None and (
            not body.force_qna or requires_full_text_compare_presentation(body.query)
        ):
            return _BRANCH_COMPARE_FULL
        if body.force_qna and body.document_url:
            return _BRANCH_COMPARE_FORCE_QNA
        if body.document_url:
            if requires_full_text_compare_presentation(body.query):
                return _BRANCH_COMPARE_NEEDS_SXS
            return _BRANCH_COMPARE_FALLBACK_QNA
        return _BRANCH_COMPARE_NEEDS_NO_DOC
    if orch.route == "summary":
        if body.force_qna and body.document_url:
            return _BRANCH_SUMMARY_FORCE_QNA
        if body.summary_context is not None:
            return _BRANCH_SUMMARY_WITH_CONTEXT
        if body.document_url:
            return _BRANCH_SUMMARY_FALLBACK_QNA
        return _BRANCH_SUMMARY_NEEDS
    return _BRANCH_QNA_PRIMARY


async def _guardrails_input_node(state: WorkflowState) -> dict[str, Any]:
    body = state["request"]
    trace = state.get("trace")
    canned = trivial_chat_reply(body.query)
    if canned is None:
        return {}
    if trace is not None:
        trace["branch"] = _BRANCH_CONVERSATIONAL
    return {
        "branch": _BRANCH_CONVERSATIONAL,
        "response": AgenticWorkflowResponse(
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
    }


async def _supervisor_node(state: WorkflowState) -> dict[str, Any]:
    body = state["request"]
    trace = state.get("trace")

    # Resolve through the legacy module so test monkeypatches of
    # app.agents.agentic_workflow.classify_intent_async apply here too.
    from app.agents import agentic_workflow as wf

    orch = await wf.classify_intent_async(
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

    branch = _decide_branch(body, orch)
    if trace is not None:
        trace["branch"] = branch
    return {"orch": orch, "branch": branch}


async def _compare_full_text_node(state: WorkflowState) -> dict[str, Any]:
    body = state["request"]
    trace = state.get("trace")
    assert body.compare_context is not None
    if trace is not None:
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
    return {
        "response": AgenticWorkflowResponse(
            intent="comparison",
            intent_id=2,
            supervisor_route="compare",
            executed=True,
            comparison=comparison,
        )
    }


async def _summary_agent_node(state: WorkflowState) -> dict[str, Any]:
    body = state["request"]
    assert body.summary_context is not None
    summary = await run_summary_agent(body.summary_context)
    return {
        "response": AgenticWorkflowResponse(
            intent="summary",
            intent_id=1,
            supervisor_route="summary",
            executed=True,
            summary=summary,
        )
    }


async def _retrieve_qna_node(state: WorkflowState) -> dict[str, Any]:
    body = state["request"]
    trace = state.get("trace")
    branch = state["branch"]

    if branch == _BRANCH_QNA_PRIMARY:
        supervisor_route, fallback_from = "qna", None
    elif branch == _BRANCH_BLOCKED_FALLBACK_QNA:
        supervisor_route, fallback_from = "blocked", "blocked"
    elif branch in (_BRANCH_COMPARE_FORCE_QNA, _BRANCH_COMPARE_FALLBACK_QNA):
        supervisor_route, fallback_from = "compare", "compare"
    else:
        supervisor_route, fallback_from = "summary", "summary"

    # Reuse the legacy retrieval+output-guardrails helper to keep the QnA
    # accounting in one place. Looked up via module so monkeypatches of
    # app.agents.agentic_workflow.retrieve_and_answer flow through.
    from app.agents import agentic_workflow as wf

    response = await wf._finish_qna_from_retrieval(
        body,
        supervisor_route=supervisor_route,
        fallback_from=fallback_from,
        trace=trace,
    )
    return {"response": response}


async def _needs_input_node(state: WorkflowState) -> dict[str, Any]:
    branch = state["branch"]
    if branch == _BRANCH_COMPARE_NEEDS_SXS:
        return {
            "response": AgenticWorkflowResponse(
                intent="comparison",
                intent_id=2,
                supervisor_route="compare",
                executed=False,
                needs_input=["compare_context.baseline_text", "compare_context.current_text"],
                reason=(
                    "Side-by-side or redline of two full document bodies needs baseline + current text in "
                    "compare_context, or use the web **Readable diff** tab when two runs are selected."
                ),
            )
        }
    if branch == _BRANCH_COMPARE_NEEDS_NO_DOC:
        return {
            "response": AgenticWorkflowResponse(
                intent="comparison",
                intent_id=2,
                supervisor_route="compare",
                executed=False,
                needs_input=["compare_context.baseline_text", "compare_context.current_text"],
            )
        }
    return {
        "response": AgenticWorkflowResponse(
            intent="summary",
            intent_id=1,
            supervisor_route="summary",
            executed=False,
            needs_input=[
                "summary_context (SummaryAgentRequest: run_point_id, document_url, version_id, summary, previews)",
            ],
        )
    }


async def _blocked_terminal_node(state: WorkflowState) -> dict[str, Any]:
    if state["branch"] == _BRANCH_BLOCKED_INPUT:
        return {}
    orch = state.get("orch")
    reason = orch.reason if orch is not None else None
    return {
        "response": AgenticWorkflowResponse(
            intent="blocked",
            intent_id=0,
            supervisor_route="blocked",
            blocked=True,
            reason=reason,
            executed=False,
            needs_input=[],
        )
    }


async def _finalize_node(state: WorkflowState) -> dict[str, Any]:
    body = state["request"]
    trace = state.get("trace")
    response = state["response"]
    return {"response": _finalize(response, trace, body)}


def _after_guardrails(state: WorkflowState) -> str:
    if state.get("branch") == _BRANCH_BLOCKED_INPUT:
        return "blocked_terminal"
    if state.get("branch") == _BRANCH_CONVERSATIONAL:
        return "finalize"
    return "supervisor"


def _after_supervisor(state: WorkflowState) -> str:
    branch = state["branch"]
    if branch == _BRANCH_COMPARE_FULL:
        return "compare_full_text"
    if branch == _BRANCH_SUMMARY_WITH_CONTEXT:
        return "summary_agent"
    if branch in _QNA_BRANCHES:
        return "retrieve_qna"
    if branch in _NEEDS_INPUT_BRANCHES:
        return "needs_input"
    if branch in _BLOCKED_BRANCHES:
        return "blocked_terminal"
    raise RuntimeError(f"workflow_graph: unknown branch {branch!r}")


def _build_graph():
    g: StateGraph = StateGraph(WorkflowState)
    g.add_node("guardrails_input", _guardrails_input_node)
    g.add_node("supervisor", _supervisor_node)
    g.add_node("compare_full_text", _compare_full_text_node)
    g.add_node("summary_agent", _summary_agent_node)
    g.add_node("retrieve_qna", _retrieve_qna_node)
    g.add_node("needs_input", _needs_input_node)
    g.add_node("blocked_terminal", _blocked_terminal_node)
    g.add_node("finalize", _finalize_node)

    g.add_edge(START, "guardrails_input")
    g.add_conditional_edges(
        "guardrails_input",
        _after_guardrails,
        {
            "blocked_terminal": "blocked_terminal",
            "finalize": "finalize",
            "supervisor": "supervisor",
        },
    )
    g.add_conditional_edges(
        "supervisor",
        _after_supervisor,
        {
            "compare_full_text": "compare_full_text",
            "summary_agent": "summary_agent",
            "retrieve_qna": "retrieve_qna",
            "needs_input": "needs_input",
            "blocked_terminal": "blocked_terminal",
        },
    )
    for leaf in (
        "compare_full_text",
        "summary_agent",
        "retrieve_qna",
        "needs_input",
        "blocked_terminal",
    ):
        g.add_edge(leaf, "finalize")
    g.add_edge("finalize", END)
    return g.compile()


_GRAPH = _build_graph()


async def run_agentic_workflow_graph(body: AgenticWorkflowRequest) -> AgenticWorkflowResponse:
    """Run the LangGraph workflow; returns the final AgenticWorkflowResponse."""
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

    initial: WorkflowState = {"request": body, "trace": trace}
    final = await _GRAPH.ainvoke(initial)
    return final["response"]
