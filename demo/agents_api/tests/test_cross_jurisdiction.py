import pytest

from app.agents.cross_jurisdiction import run_cross_jurisdiction_compare
from app.schemas import CrossJurisdictionCompareRequest, JurisdictionSnippet


@pytest.mark.asyncio
async def test_cross_jurisdiction_stub_returns_table(monkeypatch):
    monkeypatch.setattr(
        "app.agents.cross_jurisdiction.converse_text",
        lambda *_a, **_k: ("ignored", "model-x", True),
    )
    body = CrossJurisdictionCompareRequest(
        topic="Responsible gaming limits",
        snippets=[
            JurisdictionSnippet(label="A", content="x" * 50),
            JurisdictionSnippet(label="B", content="y" * 50),
        ],
    )
    out = await run_cross_jurisdiction_compare(body)
    assert out.stub is True
    assert "Responsible gaming" in out.headline
    assert "|" in out.markdown_table


@pytest.mark.asyncio
async def test_cross_jurisdiction_parses_json(monkeypatch):
    payload = (
        '{"headline":"H","markdown_table":"|a|b|\\n|---|---|\\n|1|2|","narrative":"Narr here."}'
    )

    def fake_converse(_system: str, _user: str, **kwargs):
        return payload, "test-model", False

    monkeypatch.setattr("app.agents.cross_jurisdiction.converse_text", fake_converse)
    body = CrossJurisdictionCompareRequest(
        topic="Cyber controls",
        snippets=[
            JurisdictionSnippet(label="Malta", content="z" * 40),
            JurisdictionSnippet(label="NJ", content="w" * 40),
        ],
    )
    out = await run_cross_jurisdiction_compare(body)
    assert out.stub is False
    assert out.headline == "H"
    assert "1" in out.markdown_table
