"""UC1-005 SummaryAgent parsing and scoring."""

from __future__ import annotations

import asyncio

import pytest

from app.agents.summary import run_summary_agent
from app.schemas import SummaryAgentRequest


@pytest.mark.parametrize(
    ("model_text", "expected_score", "expect_mat_nonempty"),
    [
        (
            "First para exec.\n\nSecond para materiality.\n\nSCORE: 4",
            4,
            True,
        ),
        (
            "Only one block.\n\nSCORE: 2",
            2,
            False,
        ),
        (
            "A\n\nB\n\nSCORE: 5\n\nSCORE: 1",
            1,
            True,
        ),
    ],
)
def test_summary_parses_score_and_paragraphs(
    monkeypatch: pytest.MonkeyPatch,
    model_text: str,
    expected_score: int,
    expect_mat_nonempty: bool,
) -> None:
    def fake_converse(_system: str, _user: str, **_kwargs: object) -> tuple[str, str, bool]:
        return model_text, "bedrock-test", False

    monkeypatch.setenv("AGENTS_STUB_LLM", "0")
    monkeypatch.setattr("app.agents.summary.converse_text", fake_converse)

    async def _go() -> None:
        out = await run_summary_agent(
            SummaryAgentRequest(
                run_point_id="id-1",
                document_url="https://example/reg.pdf",
                version_id="2025-01-01T12:00:00Z",
                summary={"newChunks": 2, "removedChunks": 1, "totalChunks": 10},
                added_preview=["added a", "added b"],
                removed_preview=["removed x"],
            ),
        )
        assert out.materiality_score == expected_score
        assert "First" in out.llm_summary or "Only one" in out.llm_summary or out.llm_summary.startswith("A")
        if expect_mat_nonempty:
            assert out.materiality_notes.strip()
        assert out.stub is False

    asyncio.run(_go())


def test_summary_zero_delta_score_is_low(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AGENTS_STUB_LLM", "1")

    async def _go() -> None:
        out = await run_summary_agent(
            SummaryAgentRequest(
                run_point_id="id-1",
                document_url="https://example/reg.pdf",
                version_id="v1",
                summary={"newChunks": 0, "removedChunks": 0, "totalChunks": 3},
                added_preview=[],
                removed_preview=[],
            ),
        )
        assert out.materiality_score == 1
        assert out.stub is True

    asyncio.run(_go())
