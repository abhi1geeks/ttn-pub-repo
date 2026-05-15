"""Parity smoke tests: the LangGraph and legacy engines must produce equivalent responses.

These tests don't replace the full suite in `test_agentic_workflow.py` (which already runs
under both engines via the `WORKFLOW_ENGINE` env). They lock in the behavior contract:
for a representative set of inputs, the two engines yield identical user-visible fields.
"""

from __future__ import annotations

import asyncio

import pytest

from app.agents.agentic_workflow import (
    _run_agentic_workflow_legacy,
    run_agentic_workflow,
)
from app.agents.workflow_graph import run_agentic_workflow_graph
from app.schemas import (
    AgenticWorkflowRequest,
    CompareContext,
    OrchestrateRequest,
    OrchestrateResponse,
    QnAAgentResponse,
    SummaryAgentRequest,
)


def _fields_for_compare(resp) -> dict:
    return {
        "intent": resp.intent,
        "intent_id": resp.intent_id,
        "supervisor_route": resp.supervisor_route,
        "executed": resp.executed,
        "blocked": resp.blocked,
        "fallback_from": resp.fallback_from,
        "needs_input": list(resp.needs_input),
        "has_comparison": resp.comparison is not None,
        "has_summary": resp.summary is not None,
        "has_qna": resp.qna is not None,
    }


def test_default_engine_is_langgraph(monkeypatch: pytest.MonkeyPatch) -> None:
    """run_agentic_workflow with no env override should hit the LangGraph engine."""
    monkeypatch.delenv("WORKFLOW_ENGINE", raising=False)
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    calls: list[str] = []

    async def fake_graph(_body):
        calls.append("graph")
        return await _run_agentic_workflow_legacy(_body)

    monkeypatch.setattr(
        "app.agents.workflow_graph.run_agentic_workflow_graph",
        fake_graph,
    )

    async def _go() -> None:
        body = AgenticWorkflowRequest(
            query="What is the rate?",
            document_url="http://example/doc",
        )

        async def fake_retrieve(**_kwargs):
            return (
                "ok",
                QnAAgentResponse(
                    answer="The rate is 10% [chunk:0].",
                    cited_chunk_indices=[0],
                    model_id="stub",
                    stub=True,
                ),
                None,
            )

        monkeypatch.setattr(
            "app.agents.agentic_workflow.retrieve_and_answer",
            fake_retrieve,
        )
        await run_agentic_workflow(body)

    asyncio.run(_go())
    assert calls == ["graph"]


def test_legacy_engine_when_env_set(monkeypatch: pytest.MonkeyPatch) -> None:
    """WORKFLOW_ENGINE=legacy must bypass the LangGraph engine entirely."""
    monkeypatch.setenv("WORKFLOW_ENGINE", "legacy")
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def boom(_body):
        raise AssertionError("graph engine must not run when WORKFLOW_ENGINE=legacy")

    monkeypatch.setattr(
        "app.agents.workflow_graph.run_agentic_workflow_graph",
        boom,
    )

    async def fake_retrieve(**_kwargs):
        return (
            "ok",
            QnAAgentResponse(
                answer="A [chunk:0].",
                cited_chunk_indices=[0],
                model_id="stub",
                stub=True,
            ),
            None,
        )

    monkeypatch.setattr(
        "app.agents.agentic_workflow.retrieve_and_answer",
        fake_retrieve,
    )

    async def _go() -> None:
        body = AgenticWorkflowRequest(query="What is X?", document_url="http://example/doc")
        out = await run_agentic_workflow(body)
        assert out.intent == "qna"

    asyncio.run(_go())


@pytest.mark.parametrize(
    "case_id",
    [
        "qna_primary",
        "compare_with_full_context",
        "compare_needs_no_doc",
        "compare_fallback_qna_to_doc",
        "summary_with_context",
        "summary_fallback_qna",
        "blocked_fallback_qna",
        "conversational_hi",
    ],
)
def test_engine_parity(monkeypatch: pytest.MonkeyPatch, case_id: str) -> None:
    """Both engines must agree on user-visible response fields for representative branches."""
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def fake_retrieve(**_kwargs):
        return (
            "ok",
            QnAAgentResponse(
                answer="Answer [chunk:0].",
                cited_chunk_indices=[0],
                model_id="stub",
                stub=True,
            ),
            None,
        )

    monkeypatch.setattr(
        "app.agents.agentic_workflow.retrieve_and_answer",
        fake_retrieve,
    )

    if case_id == "blocked_fallback_qna":

        async def supervisor_blocked(_req: OrchestrateRequest) -> OrchestrateResponse:
            return OrchestrateResponse(route="blocked", reason="ambiguous")

        monkeypatch.setattr(
            "app.agents.agentic_workflow.classify_intent_async",
            supervisor_blocked,
        )

    if case_id == "qna_primary":
        body = AgenticWorkflowRequest(
            query="What is the tax rate?",
            document_url="http://example/doc",
        )
    elif case_id == "compare_with_full_context":
        body = AgenticWorkflowRequest(
            query="show side by side",
            document_url="http://example/doc",
            compare_context=CompareContext(
                baseline_text="Old. " * 10,
                current_text="New. " * 10,
            ),
        )
    elif case_id == "compare_needs_no_doc":
        body = AgenticWorkflowRequest(
            query="What changed between the two versions?",
            document_url=None,
        )
    elif case_id == "compare_fallback_qna_to_doc":
        body = AgenticWorkflowRequest(
            query="What changed between version A and version B?",
            document_url="http://example/doc",
        )
    elif case_id == "summary_with_context":
        body = AgenticWorkflowRequest(
            query="Give me an executive summary",
            document_url="http://example/doc",
            summary_context=SummaryAgentRequest(
                run_point_id="pt-1",
                document_url="http://example/doc",
                version_id="v1",
                summary={"newChunks": 0, "removedChunks": 0, "totalChunks": 3},
                added_preview=[],
                removed_preview=[],
            ),
        )
    elif case_id == "summary_fallback_qna":
        body = AgenticWorkflowRequest(
            query="summarize the changes",
            document_url="http://example/doc",
        )
    elif case_id == "blocked_fallback_qna":
        body = AgenticWorkflowRequest(
            query="summarize the changes",
            document_url="http://example/doc",
        )
    elif case_id == "conversational_hi":
        body = AgenticWorkflowRequest(query="hi", document_url="http://example/doc")
    else:
        raise AssertionError(f"unhandled case_id: {case_id}")

    async def _go() -> tuple[dict, dict]:
        legacy = await _run_agentic_workflow_legacy(body)
        graph = await run_agentic_workflow_graph(body)
        return _fields_for_compare(legacy), _fields_for_compare(graph)

    legacy_fields, graph_fields = asyncio.run(_go())
    assert legacy_fields == graph_fields, (
        f"engine drift for case {case_id!r}: legacy={legacy_fields} graph={graph_fields}"
    )


def test_debug_trace_branch_parity(monkeypatch: pytest.MonkeyPatch) -> None:
    """debug_trace.branch must match between engines (clients rely on these strings)."""
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    body = AgenticWorkflowRequest(
        query="Show changes side by side",
        document_url="http://example/doc",
        debug=True,
        compare_context=CompareContext(
            baseline_text="Chapter one. " * 20,
            current_text="Chapter one revised. " * 20,
        ),
    )

    async def _go():
        legacy = await _run_agentic_workflow_legacy(body)
        graph = await run_agentic_workflow_graph(body)
        return legacy, graph

    legacy, graph = asyncio.run(_go())
    assert legacy.debug_trace is not None and graph.debug_trace is not None
    assert legacy.debug_trace.get("branch") == graph.debug_trace.get("branch")
    assert (
        legacy.debug_trace.get("orchestrate", {}).get("route")
        == graph.debug_trace.get("orchestrate", {}).get("route")
    )


def test_debug_trace_conversational_branch_parity(monkeypatch: pytest.MonkeyPatch) -> None:
    """Trivial messages skip orchestration; both engines record the same branch."""
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    body = AgenticWorkflowRequest(query="thanks", document_url="http://example/doc", debug=True)

    async def _go():
        legacy = await _run_agentic_workflow_legacy(body)
        graph = await run_agentic_workflow_graph(body)
        return legacy, graph

    legacy, graph = asyncio.run(_go())
    assert legacy.debug_trace is not None and graph.debug_trace is not None
    assert legacy.debug_trace.get("branch") == "conversational_short_circuit"
    assert legacy.debug_trace.get("branch") == graph.debug_trace.get("branch")
