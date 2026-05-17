"""CSV 2.3 — cross-jurisdiction comparison on user-supplied excerpts (demo)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.bedrock import bedrock_failure_message, converse_text
from app.schemas import CrossJurisdictionCompareRequest, CrossJurisdictionCompareResponse

logger = logging.getLogger(__name__)

_JSON_FENCE_START = re.compile(r"^\s*```(?:json)?\s*", re.IGNORECASE)
_JSON_FENCE_END = re.compile(r"\s*```\s*$", re.IGNORECASE)


def _strip_fences(raw: str) -> str:
    s = raw.strip()
    s = _JSON_FENCE_START.sub("", s)
    s = _JSON_FENCE_END.sub("", s)
    return s.strip()


def _parse_cross_json(raw: str) -> dict[str, Any] | None:
    try:
        data = json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return data


def _stub_response(req: CrossJurisdictionCompareRequest, model_id: str) -> CrossJurisdictionCompareResponse:
    rows = "\n".join(
        f"| {s.label.replace('|', '/')} | Stub — enable Bedrock for narrative compare. |"
        for s in req.snippets
    )
    return CrossJurisdictionCompareResponse(
        headline=f"[stub-llm] Cross-jurisdiction sketch: {req.topic[:120]}",
        markdown_table="| Jurisdiction | Demo note |\n|---|---|\n" + rows,
        narrative=(
            "Deterministic stub for demos when AGENTS_STUB_LLM=1. "
            f"Topic has {len(req.topic)} chars; {len(req.snippets)} jurisdiction excerpt(s) supplied."
        ),
        model_id=model_id,
        stub=True,
    )


_CROSS_SYSTEM = """You are assisting with a **demo** of cross-jurisdictional regulatory comparison for gaming compliance teams.
Return **ONLY** valid JSON (no markdown code fences) with exactly these string keys:
  "headline" — one line,
  "markdown_table" — a GitHub-flavored markdown table. Columns must include: Jurisdiction | Focus vs topic | Notable gaps/risks,
  "narrative" — 2-4 plain sentences.
Rules: do not provide legal advice; do not claim official GLI positions; prefer cautious language ("may", "could")."""


async def run_cross_jurisdiction_compare(body: CrossJurisdictionCompareRequest) -> CrossJurisdictionCompareResponse:
    parts: list[str] = []
    for i, sn in enumerate(body.snippets, 1):
        clip = sn.content[:12_000]
        url_note = f"\nCanonical URL (optional): {sn.document_url}" if sn.document_url else ""
        parts.append(f"=== Jurisdiction {i}: {sn.label} ==={url_note}\n{clip}")
    user = f"TOPIC:\n{body.topic.strip()}\n\n" + "\n\n".join(parts)
    text, mid, stub = converse_text(_CROSS_SYSTEM, user, max_tokens=1800)
    if stub:
        if bedrock_failure_message(text):
            return CrossJurisdictionCompareResponse(
                headline="Bedrock unavailable — check AWS credentials",
                markdown_table="| Status | Detail |\n|---|---|\n| Error | See narrative below |",
                narrative=text[:6000],
                model_id=mid,
                stub=True,
            )
        return _stub_response(body, mid)
    parsed = _parse_cross_json(text)
    if parsed:
        headline = str(parsed.get("headline") or "").strip() or "Cross-jurisdiction comparison"
        md = str(parsed.get("markdown_table") or parsed.get("markdownTable") or "").strip()
        narrative = str(parsed.get("narrative") or "").strip() or "See table."
        if md:
            return CrossJurisdictionCompareResponse(
                headline=headline[:500],
                markdown_table=md[:24_000],
                narrative=narrative[:6000],
                model_id=mid,
                stub=False,
            )
    logger.info("cross_jurisdiction: non-JSON model output, length=%s", len(text))
    return CrossJurisdictionCompareResponse(
        headline="Cross-jurisdiction comparison (unparsed model output)",
        markdown_table="```\n" + text[:20_000] + ("\n```" if len(text) <= 20_000 else "\n…```"),
        narrative="The model did not return valid JSON. Inspect markdown_table for raw text.",
        model_id=mid,
        stub=False,
        raw_model_text=text[:12_000],
    )
