import pytest

from app.agents.alert_triage import run_alert_triage
from app.schemas import AlertTriageRequest


@pytest.mark.asyncio
async def test_alert_triage_heuristic_stub(monkeypatch):
    monkeypatch.setattr(
        "app.agents.alert_triage.converse_text",
        lambda *_a, **_k: ("ignored", "model-y", True),
    )
    body = AlertTriageRequest(
        materiality_score=5,
        product_line="online",
        jurisdiction="Malta",
        new_chunks=2,
        removed_chunks=1,
    )
    out = await run_alert_triage(body)
    assert out.stub is True
    assert out.relevance_tier == "high"
    assert "Online" in out.routing_queue or "queue" in out.routing_queue.lower()
    assert len(out.tags) >= 2


@pytest.mark.asyncio
async def test_alert_triage_parses_json(monkeypatch):
    raw = """
    {"relevance_tier":"high","routing_queue":"Desk X","tags":["A","B"],
     "rationale":"Because material change."}
    """

    monkeypatch.setattr(
        "app.agents.alert_triage.converse_text",
        lambda *_a, **_k: (raw, "mid", False),
    )
    body = AlertTriageRequest(materiality_score=4, executive_summary="Major logging change detected.")
    out = await run_alert_triage(body)
    assert out.stub is False
    assert out.routing_queue == "Desk X"
    assert out.relevance_tier == "high"


@pytest.mark.asyncio
async def test_alert_triage_bedrock_failure_falls_back(monkeypatch):
    err = "[stub-llm] Bedrock error: Unable to locate credentials"
    monkeypatch.setattr(
        "app.agents.alert_triage.converse_text",
        lambda *_a, **_k: (err, "mid", True),
    )
    body = AlertTriageRequest(materiality_score=3)
    out = await run_alert_triage(body)
    assert out.stub is True
    assert "credentials" in out.rationale or "Heuristic" in out.rationale
