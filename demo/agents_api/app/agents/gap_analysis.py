"""CSV 2.4 — regulatory gap analysis (certification profile vs new text, demo)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.bedrock import bedrock_failure_message, converse_text
from app.schemas import GapAnalysisRequest, GapAnalysisResponse, GapItem

logger = logging.getLogger(__name__)

_JSON_FENCE_START = re.compile(r"^\s*```(?:json)?\s*", re.IGNORECASE)
_JSON_FENCE_END = re.compile(r"\s*```\s*$", re.IGNORECASE)


def _strip_fences(raw: str) -> str:
    s = raw.strip()
    s = _JSON_FENCE_START.sub("", s)
    s = _JSON_FENCE_END.sub("", s)
    return s.strip()


def _parse_gap_json(raw: str) -> dict[str, Any] | None:
    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return data


def _coerce_gap_items(raw_gaps: Any) -> list[GapItem]:
    if not isinstance(raw_gaps, list):
        return []
    out: list[GapItem] = []
    for g in raw_gaps[:24]:
        if not isinstance(g, dict):
            continue
        title = str(g.get("title") or "").strip()
        sev = str(g.get("severity") or "low").lower()
        if sev not in ("low", "medium", "high"):
            sev = "low"
        desc = str(g.get("description") or "").strip()
        rec = str(g.get("recommended_action") or g.get("recommendedAction") or "").strip()
        if not title or not desc:
            continue
        try:
            out.append(GapItem(title=title[:400], severity=sev, description=desc[:4000], recommendedAction=rec[:4000]))
        except Exception:  # noqa: BLE001
            continue
    return out


def _stub_gap(body: GapAnalysisRequest, model_id: str) -> GapAnalysisResponse:
    pl = (body.product_line or "unspecified").strip()
    return GapAnalysisResponse(
        executive_summary=(
            f"[stub-llm] Gap screening sketch for product line “{pl}”. "
            "Enable Bedrock (AGENTS_STUB_LLM=0) for structured gap findings."
        ),
        gaps=[
            GapItem(
                title="Stub gap — evidence logging",
                severity="medium",
                description="Replace stub with model output comparing profile bullets to the regulatory excerpt.",
                recommended_action="Re-run with live LLM; attach citations to clause IDs where possible.",
            )
        ],
        model_id=model_id,
        stub=True,
    )


_GAP_SYSTEM = """You assist gaming labs with a **demo** regulatory gap review.
Return **ONLY** valid JSON (no markdown fences) with keys:
  "executive_summary" — 3-6 sentences, plain language,
  "gaps" — array of 3 to 8 objects, each with keys:
      "title" (string),
      "severity" (one of: low, medium, high),
      "description" (string),
      "recommended_action" (string).
Compare CERTIFICATION_PROFILE to REGULATORY_CHANGE_TEXT. Flag where recertification or control updates may be needed.
Do not provide legal advice; use cautious wording."""


async def run_gap_analysis(body: GapAnalysisRequest) -> GapAnalysisResponse:
    profile = body.certification_profile.strip()[:20_000]
    reg = body.regulatory_change_text.strip()[:40_000]
    pl = body.product_line or ""
    user = (
        f"PRODUCT_LINE_HINT: {pl}\n\n"
        f"CERTIFICATION_PROFILE:\n{profile}\n\n"
        f"REGULATORY_CHANGE_TEXT:\n{reg}\n"
    )
    text, mid, stub = converse_text(_GAP_SYSTEM, user, max_tokens=2200)
    if stub:
        if bedrock_failure_message(text):
            return GapAnalysisResponse(
                executive_summary=text[:8000],
                gaps=[],
                model_id=mid,
                stub=True,
            )
        return _stub_gap(body, mid)
    parsed = _parse_gap_json(text)
    if parsed:
        summary = str(parsed.get("executive_summary") or parsed.get("executiveSummary") or "").strip()
        gaps = _coerce_gap_items(parsed.get("gaps"))
        if summary and gaps:
            return GapAnalysisResponse(
                executive_summary=summary[:8000],
                gaps=gaps,
                model_id=mid,
                stub=False,
            )
        if summary:
            return GapAnalysisResponse(executive_summary=summary[:8000], gaps=[], model_id=mid, stub=False)
    logger.info("gap_analysis: non-JSON model output, length=%s", len(text))
    return GapAnalysisResponse(
        executive_summary="The model did not return valid JSON. See raw_model_text for the transcript.",
        gaps=[],
        model_id=mid,
        stub=False,
        raw_model_text=text[:16_000],
    )
