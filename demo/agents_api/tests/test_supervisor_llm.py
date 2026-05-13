import asyncio

import pytest

from app.agents.supervisor import classify_intent, classify_intent_async
from app.schemas import OrchestrateRequest


def test_classify_intent_rules_when_stub_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")
    monkeypatch.setenv("SUPERVISOR_USE_LLM", "auto")
    out = classify_intent(OrchestrateRequest(user_message="summarize the changes?", document_url="http://x"))
    assert out.route == "summary"


def test_classify_intent_llm_when_forced(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")
    monkeypatch.setenv("SUPERVISOR_USE_LLM", "llm")

    def fake_converse(_system: str, _user: str, **kwargs: object) -> tuple[str, str, bool]:
        return '{"route": "qna", "reason": null}', "amazon.nova-pro-v1:0", False

    monkeypatch.setattr("app.bedrock.converse_text", fake_converse)
    out = classify_intent(OrchestrateRequest(user_message="summarize the changes?", document_url="http://x"))
    assert out.route == "qna"


def test_classify_intent_async_delegates(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def _go() -> None:
        out = await classify_intent_async(
            OrchestrateRequest(user_message="What is the penalty amount?", document_url="http://x")
        )
        assert out.route == "qna"

    asyncio.run(_go())


def test_llm_blocked_with_document_url_falls_back_to_rules(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")
    monkeypatch.setenv("SUPERVISOR_USE_LLM", "llm")

    def fake_llm(_req: OrchestrateRequest):
        from app.schemas import OrchestrateResponse

        return OrchestrateResponse(route="blocked", reason="The user's request is ambiguous.")

    monkeypatch.setattr("app.agents.supervisor._llm_classify", fake_llm)
    out = classify_intent(OrchestrateRequest(user_message="can you summarize the changes", document_url="http://x"))
    assert out.route == "summary"
