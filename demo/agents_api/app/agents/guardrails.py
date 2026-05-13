"""Deterministic guardrails (XC-002 style citations, basic injection hygiene)."""

from __future__ import annotations

import re
from typing import Any

from pydantic import ValidationError

from app.schemas import (
    GuardrailsValidateRequest,
    GuardrailsValidateResponse,
    SummaryAgentResponse,
)

# High-signal prompt-injection phrases (non-exhaustive POC list)
_INJECTION_PATTERNS = re.compile(
    r"(?i)\b(ignore (all )?(previous|prior) instructions|system prompt|"
    r"you are now|override (your )?rules|jailbreak|DAN mode)\b"
)

_CHUNK_CITE = re.compile(r"\[chunk:(\d+)\]")


def validate_guardrails(req: GuardrailsValidateRequest) -> GuardrailsValidateResponse:
    if req.phase == "input":
        t = (req.text or "").strip()
        if not t:
            return GuardrailsValidateResponse(allowed=False, reason="empty_input")
        if len(t) > 16_000:
            return GuardrailsValidateResponse(allowed=False, reason="input_too_long")
        if _INJECTION_PATTERNS.search(t):
            return GuardrailsValidateResponse(allowed=False, reason="disallowed_content_pattern")
        return GuardrailsValidateResponse(allowed=True)

    # output phase
    t = (req.text or "").strip()
    if req.require_chunk_citations:
        cites = _CHUNK_CITE.findall(t)
        if not cites:
            return GuardrailsValidateResponse(
                allowed=False,
                reason="missing_chunk_citations_expected_markers_like_chunk_0",
            )

    if req.summary_json is not None:
        try:
            SummaryAgentResponse.model_validate(req.summary_json)
        except ValidationError as e:
            return GuardrailsValidateResponse(allowed=False, reason=f"summary_schema:{e.error_count()}")

    if not t and not req.summary_json:
        return GuardrailsValidateResponse(allowed=False, reason="empty_output")

    return GuardrailsValidateResponse(allowed=True)


def enforce_qna_citations(answer: str, valid_indices: set[int]) -> tuple[str, list[int]]:
    """Ensure at least one [chunk:N] with N in valid_indices; append if model forgot."""
    found = [int(m) for m in _CHUNK_CITE.findall(answer)]
    ok = [i for i in found if i in valid_indices]
    if ok:
        return answer, sorted(set(ok))
    first = min(valid_indices)
    suffix = f"\n\nSources: [chunk:{first}]"
    return answer.strip() + suffix, [first]


def summarize_json_schema(obj: dict[str, Any]) -> bool:
    try:
        SummaryAgentResponse.model_validate(obj)
        return True
    except ValidationError:
        return False
