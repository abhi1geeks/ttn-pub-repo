import pytest

from app.agents.gap_analysis import run_gap_analysis
from app.schemas import GapAnalysisRequest


@pytest.mark.asyncio
async def test_gap_analysis_stub(monkeypatch):
    monkeypatch.setattr(
        "app.agents.gap_analysis.converse_text",
        lambda *_a, **_k: ("ignored", "model-y", True),
    )
    body = GapAnalysisRequest(
        certification_profile="- RNG sealed\n- Log retention 90d\n" + "x" * 30,
        regulatory_change_text="Operators shall retain logs for not less than 180 days." + "y" * 30,
        product_line="slots",
    )
    out = await run_gap_analysis(body)
    assert out.stub is True
    assert out.gaps
    assert "stub" in out.executive_summary.lower()


@pytest.mark.asyncio
async def test_gap_analysis_bedrock_failure_not_demo_stub(monkeypatch):
    err = "[stub-llm] Bedrock error: Unable to locate credentials"

    monkeypatch.setattr(
        "app.agents.gap_analysis.converse_text",
        lambda *_a, **_k: (err, "model-y", True),
    )
    body = GapAnalysisRequest(
        certification_profile="profile " * 10,
        regulatory_change_text="reg change " * 10,
    )
    out = await run_gap_analysis(body)
    assert out.stub is True
    assert out.gaps == []
    assert "Unable to locate credentials" in out.executive_summary
    assert "Stub gap" not in out.executive_summary


@pytest.mark.asyncio
async def test_gap_analysis_parses_json(monkeypatch):
    raw = """
    {"executive_summary":"Exec here.",
     "gaps":[
       {"title":"Log retention","severity":"high","description":"D1","recommended_action":"R1"}
     ]}
    """

    def fake_converse(_system: str, _user: str, **kwargs):
        return raw, "mid", False

    monkeypatch.setattr("app.agents.gap_analysis.converse_text", fake_converse)
    body = GapAnalysisRequest(
        certification_profile="profile " * 10,
        regulatory_change_text="reg change " * 10,
    )
    out = await run_gap_analysis(body)
    assert out.stub is False
    assert "Exec here" in out.executive_summary
    assert len(out.gaps) == 1
    assert out.gaps[0].title == "Log retention"
    assert out.gaps[0].severity == "high"
