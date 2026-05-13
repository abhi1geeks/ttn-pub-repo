import asyncio

import pytest

from app.agents.agentic_workflow import run_agentic_workflow
from app.agents.supervisor import orchestrate
from app.schemas import AgenticWorkflowRequest, OrchestrateRequest


def test_supervisor_routes_side_by_side_to_compare() -> None:
    out = orchestrate(
        OrchestrateRequest(user_message="can you show me the changes side by side", document_url="http://x")
    )
    assert out.route == "compare"


def test_agentic_side_by_side_without_compare_context_needs_input(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def _go() -> None:
        body = AgenticWorkflowRequest(
            query="can you show me the changes side by side",
            document_url="http://example/doc",
        )
        out = await run_agentic_workflow(body)
        assert out.intent == "comparison"
        assert out.intent_id == 2
        assert out.executed is False
        assert "compare_context" in " ".join(out.needs_input)
        assert out.reason is not None
        assert "Readable diff" in out.reason

    asyncio.run(_go())
