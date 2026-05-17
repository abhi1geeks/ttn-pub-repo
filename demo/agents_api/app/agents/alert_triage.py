"""CSV 1.3 — AI alert scoring, tagging, and routing suggestions (demo)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.bedrock import bedrock_failure_message, bedrock_unavailable_user_message, converse_text
from app.schemas import AlertTriageRequest, AlertTriageResponse

logger = logging.getLogger(__name__)

_JSON_FENCE_START = re.compile(r"^\s*```(?:json)?\s*", re.IGNORECASE)
_JSON_FENCE_END = re.compile(r"\s*```\s*$", re.IGNORECASE)

_TIER = frozenset({"low", "medium", "high"})


def _strip_fences(raw: str) -> str:
    s = raw.strip()
    s = _JSON_FENCE_START.sub("", s)
    s = _JSON_FENCE_END.sub("", s)
    return s.strip()


def _parse_triage_json(raw: str) -> dict[str, Any] | None:
    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _heuristic_triage(body: AlertTriageRequest, *, note: str | None = None) -> AlertTriageResponse:
    score = body.materiality_score
    if score is not None and score >= 4:
        tier = "high"
        queue = "Priority certification desk · queue P1 (demo)"
    elif score == 3:
        tier = "medium"
        queue = "Central regulatory monitoring · queue A (demo)"
    else:
        tier = "low" if score is not None else "medium"
        queue = "Central regulatory monitoring · queue A (demo)"

    pl = (body.product_line or "").strip()
    ju = (body.jurisdiction or "").strip()
    if "online" in pl.lower() or ju.lower() in ("malta", "uk", "jersey"):
        queue = "Online gaming lab · queue B (demo)"

    tags: list[str] = ["Topic: regulatory change"]
    if ju:
        tags.append(f"Jurisdiction: {ju}")
    if pl:
        tags.append(f"Product line: {pl}")
    if body.effective_date:
        tags.append(f"Effective: {body.effective_date.strip()}")
    if score is not None:
        tags.append(f"Materiality: {score}/5")

    rationale = note or (
        "Heuristic routing from materiality score and ingest metadata (AGENTS_STUB_LLM=1 or Bedrock unavailable)."
    )
    return AlertTriageResponse(
        relevance_tier=tier,
        routing_queue=queue,
        tags=tags[:8],
        rationale=rationale[:4000],
        model_id="heuristic-demo",
        stub=True,
    )


_TRIAGE_SYSTEM = """You assist a gaming compliance operations desk with **demo** alert triage.
Return **ONLY** valid JSON (no markdown fences) with keys:
  "relevance_tier": one of low, medium, high,
  "routing_queue": short string naming a team/queue for follow-up,
  "tags": array of 3 to 8 short tag strings (jurisdiction, product, topic),
  "rationale": 2-4 sentences explaining why this alert should go to that queue.
Use cautious language; do not provide legal advice."""


async def run_alert_triage(body: AlertTriageRequest) -> AlertTriageResponse:
    parts = [
        f"materiality_score={body.materiality_score if body.materiality_score is not None else 'unknown'}",
        f"product_line={body.product_line or 'unspecified'}",
        f"jurisdiction={body.jurisdiction or 'unspecified'}",
        f"effective_date={body.effective_date or 'unknown'}",
        f"chunk_delta: +{body.new_chunks} / -{body.removed_chunks}",
    ]
    if body.executive_summary:
        parts.append(f"executive_summary:\n{body.executive_summary[:4000]}")
    if body.materiality_notes:
        parts.append(f"materiality_notes:\n{body.materiality_notes[:4000]}")
    user = "\n".join(parts)

    text, mid, stub = converse_text(_TRIAGE_SYSTEM, user, max_tokens=900)
    if stub:
        if bedrock_failure_message(text):
            note = bedrock_unavailable_user_message(text)
            return _heuristic_triage(body, note=note)
        return _heuristic_triage(body)

    parsed = _parse_triage_json(text)
    if parsed:
        tier = str(parsed.get("relevance_tier") or parsed.get("relevanceTier") or "").lower()
        if tier not in _TIER:
            tier = "medium"
        queue = str(parsed.get("routing_queue") or parsed.get("routingQueue") or "").strip()
        raw_tags = parsed.get("tags")
        tags: list[str] = []
        if isinstance(raw_tags, list):
            for t in raw_tags[:8]:
                s = str(t).strip()
                if s:
                    tags.append(s[:200])
        rationale = str(parsed.get("rationale") or "").strip()
        if queue and tags and rationale:
            return AlertTriageResponse(
                relevance_tier=tier,
                routing_queue=queue[:400],
                tags=tags,
                rationale=rationale[:4000],
                model_id=mid,
                stub=False,
            )

    logger.info("alert_triage: non-JSON model output, length=%s", len(text))
    out = _heuristic_triage(body, note="Model did not return valid JSON; showing heuristic routing.")
    return AlertTriageResponse(
        relevance_tier=out.relevance_tier,
        routing_queue=out.routing_queue,
        tags=out.tags,
        rationale=out.rationale,
        model_id=mid,
        stub=False,
        raw_model_text=text[:12_000],
    )
