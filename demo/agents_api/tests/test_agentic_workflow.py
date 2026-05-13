import asyncio

import pytest

from app.agents.agentic_workflow import run_agentic_workflow
from app.schemas import (
    AgenticWorkflowRequest,
    CompareContext,
    OrchestrateRequest,
    OrchestrateResponse,
    QnAAgentResponse,
    SummaryAgentRequest,
)


def test_supervisor_intent_mapping() -> None:
    from app.agents.supervisor import supervisor_intent

    assert supervisor_intent("summary") == ("summary", 1)
    assert supervisor_intent("compare") == ("comparison", 2)
    assert supervisor_intent("qna") == ("qna", 3)
    assert supervisor_intent("blocked") == ("blocked", 0)


def test_agentic_debug_trace_on_compare(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def _go() -> None:
        body = AgenticWorkflowRequest(
            query="Show changes side by side",
            document_url="http://example/doc",
            debug=True,
            compare_context=CompareContext(
                baseline_text="Chapter one. " * 20,
                current_text="Chapter one revised. " * 20,
            ),
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "comparison"
        assert out.debug_trace is not None
        assert out.debug_trace.get("branch") == "compare_with_full_context"
        assert "orchestrate" in out.debug_trace
        assert out.comparison is not None
        assert out.comparison.debug_meta is not None
        assert "compare_llm_user_prompt_chars" in out.comparison.debug_meta

    asyncio.run(_go())


def test_agentic_compare_runs_when_context_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def _go() -> None:
        body = AgenticWorkflowRequest(
            query="Please compare version A versus version B",
            document_url="http://example/doc",
            compare_context=CompareContext(
                baseline_text="Chapter one. " * 20,
                current_text="Chapter one revised. " * 20,
            ),
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "comparison"
        assert out.intent_id == 2
        assert out.executed is True
        assert out.comparison is not None
        assert out.comparison.headline
        assert out.debug_trace is None
        assert out.comparison.debug_meta is None

    asyncio.run(_go())


def test_agentic_compare_needs_context_without_document(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def _go() -> None:
        body = AgenticWorkflowRequest(
            query="What changed between the two versions?",
            document_url=None,
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "comparison"
        assert out.intent_id == 2
        assert out.executed is False
        assert "compare_context" in " ".join(out.needs_input)

    asyncio.run(_go())


def test_agentic_compare_fallback_to_qna_when_no_compare_context(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def fake_retrieve(**_kwargs: object) -> tuple[str, QnAAgentResponse | None, str | None]:
        return (
            "ok",
            QnAAgentResponse(
                answer="Changes include … [chunk:0].",
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
        body = AgenticWorkflowRequest(
            query="What changed between version A and version B?",
            document_url="http://example/doc",
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "qna"
        assert out.intent_id == 3
        assert out.supervisor_route == "compare"
        assert out.fallback_from == "compare"
        assert out.executed is True
        assert out.qna is not None

    asyncio.run(_go())


def test_agentic_compare_shortcut_bypasses_qna_supervisor_when_both_texts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """UI sends compare_context + 'Compared to official … modified'; must not answer via RAG."""
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def always_qna(_req: OrchestrateRequest) -> OrchestrateResponse:
        return OrchestrateResponse(route="qna")

    monkeypatch.setattr("app.agents.agentic_workflow.classify_intent_async", always_qna)

    async def _go() -> None:
        body = AgenticWorkflowRequest(
            query=(
                "Compared to the official Regulation 14 extract, what are the main differences "
                "in the modified version?"
            ),
            document_url="http://example/doc",
            compare_context=CompareContext(
                baseline_text="Official 14.010 … " * 30,
                current_text="Modified 14.0105 … " * 30,
            ),
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "comparison"
        assert out.intent_id == 2
        assert out.executed is True
        assert out.comparison is not None

    asyncio.run(_go())


def test_agentic_compare_shortcut_respects_force_qna(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def always_qna(_req: OrchestrateRequest) -> OrchestrateResponse:
        return OrchestrateResponse(route="qna")

    monkeypatch.setattr("app.agents.agentic_workflow.classify_intent_async", always_qna)

    async def fake_retrieve(**_kwargs: object) -> tuple[str, QnAAgentResponse | None, str | None]:
        return (
            "ok",
            QnAAgentResponse(
                answer="From chunks [chunk:0].",
                cited_chunk_indices=[0],
                model_id="stub",
                stub=True,
            ),
            None,
        )

    monkeypatch.setattr("app.agents.agentic_workflow.retrieve_and_answer", fake_retrieve)

    async def _go() -> None:
        body = AgenticWorkflowRequest(
            query="Compared to the official extract, what are the main differences in the modified version?",
            document_url="http://example/doc",
            force_qna=True,
            compare_context=CompareContext(
                baseline_text="Official … " * 20,
                current_text="Modified … " * 20,
            ),
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "qna"
        assert out.qna is not None

    asyncio.run(_go())


def test_agentic_summary_fallback_to_qna_when_no_summary_context(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def fake_retrieve(**_kwargs: object) -> tuple[str, QnAAgentResponse | None, str | None]:
        return (
            "ok",
            QnAAgentResponse(
                answer="High-level recap [chunk:1].",
                cited_chunk_indices=[1],
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
        body = AgenticWorkflowRequest(
            query="can you summarize the changes",
            document_url="http://example/doc",
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "qna"
        assert out.intent_id == 3
        assert out.supervisor_route == "summary"
        assert out.fallback_from == "summary"
        assert out.executed is True
        assert out.qna is not None

    asyncio.run(_go())


def test_agentic_summary_runs_with_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def _go() -> None:
        body = AgenticWorkflowRequest(
            query="Give me an executive summary of regulatory impact",
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
        out = await run_agentic_workflow(body)
        assert out.intent == "summary"
        assert out.intent_id == 1
        assert out.executed is True
        assert out.summary is not None
        assert out.summary.stub is True
        assert out.summary.materiality_score == 1

    asyncio.run(_go())


def test_agentic_qna_uses_retrieve(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def fake_retrieve(**_kwargs: object) -> tuple[str, QnAAgentResponse | None, str | None]:
        return (
            "ok",
            QnAAgentResponse(
                answer="The rate is 21% [chunk:0].",
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
        body = AgenticWorkflowRequest(
            query="What is the tax rate?",
            document_url="http://example/doc",
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "qna"
        assert out.intent_id == 3
        assert out.executed is True
        assert out.qna is not None
        assert "[chunk:0]" in out.qna.answer

    asyncio.run(_go())


def test_agentic_blocked_supervisor_runs_qna_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def fake_classify(_req: OrchestrateRequest):
        from app.schemas import OrchestrateResponse

        return OrchestrateResponse(route="blocked", reason="ambiguous")

    async def fake_retrieve(**_kwargs: object) -> tuple[str, QnAAgentResponse | None, str | None]:
        return (
            "ok",
            QnAAgentResponse(
                answer="Recap [chunk:0].",
                cited_chunk_indices=[0],
                model_id="stub",
                stub=True,
            ),
            None,
        )

    monkeypatch.setattr("app.agents.agentic_workflow.classify_intent_async", fake_classify)
    monkeypatch.setattr("app.agents.agentic_workflow.retrieve_and_answer", fake_retrieve)

    async def _go() -> None:
        body = AgenticWorkflowRequest(query="can you summarize the changes", document_url="http://example/doc")
        out = await run_agentic_workflow(body)
        assert out.intent == "qna"
        assert out.intent_id == 3
        assert out.supervisor_route == "blocked"
        assert out.fallback_from == "blocked"
        assert out.executed is True
        assert out.qna is not None

    asyncio.run(_go())
