"""Structural routing helpers when full compare texts are attached or LLM router is off.

These are **not** a substitute for semantic intent classification: they encode conservative
signals for attachment-aware workflows and deterministic dev/stub fallback. Prefer
`SUPERVISOR_USE_LLM=always` in environments where Bedrock is available.
"""

from __future__ import annotations

import re

# User goal patterns that require two full bodies (or product diff UI) — attachment layer only.
_FULL_TEXT_COMPARE_QUERY = re.compile(
    r"(?i)(side[\s-]by[\s-]side|side by side|two[\s-]column|adjacent columns|redline|full[\s-]text[\s-](diff|compare)|"
    r"diff[\s-]view|column[\s-]by[\s-]column|"
    r"page[\s-]wise|page\s+by\s+page|paginated\s+(diff|compare|view)|compare\s+page[\s-]by[\s-]page)"
)

_COMPARE_WHEN_BOTH_TEXTS = re.compile(
    r"(?i)(\bcompared\s+to\b|\bcompared\s+with\b|\bmain\s+differences\b|\bkey\s+differences\b|\bdifferences\s+between\b|"
    r"\bredline\b|"
    r"\b(modified|amended|current|draft)\s+version\b.{0,200}\b(differences?|changes?)\b|"
    r"\b(differences?|changes?)\b.{0,200}\b(modified|amended|current|draft)\s+version\b|"
    r"\bofficial\b.{0,200}\b(differences?|changes?|compare|diff)\b|"
    r"\b(differences?|changes?|compare|diff)\b.{0,200}\bofficial\b)"
)

_COMPARE_HINTS = re.compile(
    r"(?i)\b(compare[sd]?|compared\s+to|compared\s+with|diff|redline|what changed|main\s+differences|"
    r"key\s+differences|differences\s+between|delta|versus|vs\.?|between versions|side[\s-]by[\s-]side|side by side)\b"
)
_SUMMARY_HINTS = re.compile(
    r"(?i)\b(summarize|summary|materiality|impact|tl;dr|brief me|executive overview)\b"
)


def requires_full_text_compare_presentation(query: str) -> bool:
    """True when the user explicitly asks for a presentation that needs two full texts."""
    return bool(_FULL_TEXT_COMPARE_QUERY.search(query))


def compare_cross_version_question(query: str) -> bool:
    """True when the question is about differences across versions / official vs modified (heuristic)."""
    q = query.strip()
    if _FULL_TEXT_COMPARE_QUERY.search(q):
        return True
    return bool(_COMPARE_WHEN_BOTH_TEXTS.search(q))


def rules_compare_route_message(msg: str) -> bool:
    """Dev/stub fallback: surface-level hint that user may want compare."""
    return bool(_COMPARE_HINTS.search(msg))


def rules_summary_route_message(msg: str) -> bool:
    """Dev/stub fallback: surface-level hint that user may want ingest summary."""
    return bool(_SUMMARY_HINTS.search(msg))
