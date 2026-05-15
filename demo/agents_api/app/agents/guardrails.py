"""Deterministic guardrails (chunk citations, injection / prompt-exfiltration hygiene).

Per-agent safety framing lives in `app.agents.agent_definitions` (personas + guardrail bullets);
this module enforces cross-cutting input/output checks.
"""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import ValidationError

from app.schemas import (
    AgenticWorkflowRequest,
    CompareAgentRequest,
    GuardrailsValidateRequest,
    GuardrailsValidateResponse,
    SummaryAgentRequest,
    SummaryAgentResponse,
)

# High-signal prompt-injection phrases (non-exhaustive)
_INJECTION_PATTERNS = re.compile(
    r"(?i)\b(ignore (all )?(previous|prior) instructions|system prompt|"
    r"you are now|override (your )?rules|jailbreak|DAN mode|"
    r"developer message|end\s*of\s*system|begin\s*of\s*system)\b"
)

# Attempts to exfiltrate hidden instructions / full prompt context (avoid bare "code fence" — false positives).
_PROMPT_EXFIL_PATTERNS = re.compile(
    r"(?i)(?:"
    r"behind\s+a\s+code\s*fence|"
    r"inside\s+a\s+code\s*fence|"
    r"into\s+a\s+code\s*fence|"
    r"elid(e|ing)\s+nothing|"
    r"from\s+the\s+start\s+of\s+(the\s+)?context|"
    r"start\s+of\s+context\s+to\s+here|"
    r"format\s+the\s+above\s+(behind|inside|into)|"
    r"format\s+.{0,160}?\b(?:behind|inside|into)\b.{0,60}?\bcode\s*fence\b|"
    r"reveal\s+(your\s+)?(system|hidden)\s+(prompt|message|instructions)|"
    r"repeat\s+(your\s+)?(full\s+)?(system\s+)?(prompt|instructions)\b|"
    r"dump\s+(your\s+)?(the\s+)?(full\s+)?(system\s+)?prompt|"
    r"output\s+everything\s+above|"
    r"print\s+.{0,60}?system\s+prompt|"
    r"transcribe\s+(the\s+)?(full\s+)?(prompt|system)|"
    r"verbatim.{0,80}?(prompt|instructions|system\s+message)"
    r")"
)

# QnA answers must not echo our system/developer scaffolding (post-model safety net).
_OUTPUT_PROMPT_LEAK = re.compile(
    r"(?is)"
    r"\*\*persona:\*\*|"
    r"\*\*specification:\*\*|"
    r"\*\*guardrails:\*\*|"
    r"additional retrieval rules:|"
    r"##\s+retrieval-grounded|"
    r"##\s+task execution|"
    r"context excerpts \(ground truth|"
    r"regulatory document intelligence for gaming compliance"
)

_CHUNK_CITE = re.compile(r"\[chunk:(\d+)\]")

# Window size for scanning very long bodies (compare texts) without feeding huge strings to regex.
_POLICY_SCAN_WINDOW = 14_000


def _policy_violation_reason_in_plain_text(text: str) -> str | None:
    """Match injection / exfil patterns only (no length or empty checks). Returns reason or None."""
    if _INJECTION_PATTERNS.search(text):
        return "disallowed_content_pattern"
    if _PROMPT_EXFIL_PATTERNS.search(text):
        return "prompt_exfiltration_attempt"
    return None


def policy_violation_reason_long_text(text: str) -> str | None:
    """Policy scan for arbitrary-length text: full string if short; else head, tail, and mid windows."""
    if not text:
        return None
    n = len(text)
    w = _POLICY_SCAN_WINDOW
    if n <= w:
        return _policy_violation_reason_in_plain_text(text)
    segments = (
        text[:w],
        text[-w:],
        text[max(0, n // 2 - w // 2) : max(0, n // 2 - w // 2) + w],
    )
    for seg in segments:
        hit = _policy_violation_reason_in_plain_text(seg)
        if hit is not None:
            return hit
    return None


def first_agentic_input_policy_violation(body: AgenticWorkflowRequest) -> str | None:
    """Return first failing guard reason for any user-controlled field on agentic workflow, or None."""
    gq = validate_guardrails(
        GuardrailsValidateRequest(phase="input", text=body.query, require_chunk_citations=False)
    )
    if not gq.allowed:
        return gq.reason
    cc = body.compare_context
    if cc is not None:
        for txt in (cc.baseline_text, cc.current_text):
            hit = policy_violation_reason_long_text(txt)
            if hit is not None:
                return hit
        for ch in cc.chunk_changes:
            hit = policy_violation_reason_long_text(ch.excerpt or "")
            if hit is not None:
                return hit
    sc = body.summary_context
    if sc is not None:
        hit_sc = first_summary_input_policy_violation(sc)
        if hit_sc is not None:
            return hit_sc
    return None


def first_summary_input_policy_violation(body: SummaryAgentRequest) -> str | None:
    """Return first failing guard reason for summary agent inputs, or None."""
    for line in (*body.added_preview, *body.removed_preview):
        if not (line or "").strip():
            continue
        hit = policy_violation_reason_long_text(line)
        if hit is not None:
            return hit
    try:
        summary_blob = json.dumps(body.summary, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        summary_blob = ""
    if summary_blob:
        hit = policy_violation_reason_long_text(summary_blob)
        if hit is not None:
            return hit
    return None


def first_compare_agent_request_policy_violation(body: CompareAgentRequest) -> str | None:
    """Return first failing guard reason for compare agent inputs, or None."""
    uq = (body.user_question or "").strip()
    if uq:
        g = validate_guardrails(
            GuardrailsValidateRequest(phase="input", text=uq, require_chunk_citations=False)
        )
        if not g.allowed:
            return g.reason
    for txt in (body.baseline_text, body.current_text):
        hit = policy_violation_reason_long_text(txt)
        if hit is not None:
            return hit
    for ch in body.chunk_changes:
        hit = policy_violation_reason_long_text(ch.excerpt or "")
        if hit is not None:
            return hit
    return None


def validate_guardrails(req: GuardrailsValidateRequest) -> GuardrailsValidateResponse:
    if req.phase == "input":
        t = (req.text or "").strip()
        if not t:
            return GuardrailsValidateResponse(allowed=False, reason="empty_input")
        if len(t) > 16_000:
            return GuardrailsValidateResponse(allowed=False, reason="input_too_long")
        if _INJECTION_PATTERNS.search(t):
            return GuardrailsValidateResponse(allowed=False, reason="disallowed_content_pattern")
        if _PROMPT_EXFIL_PATTERNS.search(t):
            return GuardrailsValidateResponse(allowed=False, reason="prompt_exfiltration_attempt")
        return GuardrailsValidateResponse(allowed=True)

    # output phase
    t = (req.text or "").strip()
    if req.require_chunk_citations:
        if _OUTPUT_PROMPT_LEAK.search(t):
            return GuardrailsValidateResponse(allowed=False, reason="output_prompt_echo_blocked")
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
