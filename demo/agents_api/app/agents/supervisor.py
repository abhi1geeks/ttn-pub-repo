"""Supervisor routing: auto intent from user message (LLM when enabled, else rules)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Literal

from app.schemas import OrchestrateRequest, OrchestrateResponse

logger = logging.getLogger(__name__)

_SUPERVISOR_ROUTE = Literal["qna", "summary", "compare", "blocked"]
_VALID_ROUTES = frozenset({"qna", "summary", "compare", "blocked"})

_COMPARE_HINTS = re.compile(
    r"(?i)\b(compare[sd]?|compared\s+to|compared\s+with|diff|redline|what changed|main\s+differences|"
    r"key\s+differences|differences\s+between|delta|versus|vs\.?|between versions|side[\s-]by[\s-]side|side by side)\b"
)
_SUMMARY_HINTS = re.compile(
    r"(?i)\b(summarize|summary|materiality|impact|tl;dr|brief me|executive overview)\b"
)


def supervisor_intent(route: _SUPERVISOR_ROUTE) -> tuple[str, int]:
    """Map internal route to API intent label and numeric id (0=blocked, 1=summary, 2=comparison, 3=QnA)."""
    if route == "blocked":
        return "blocked", 0
    if route == "summary":
        return "summary", 1
    if route == "compare":
        return "comparison", 2
    return "qna", 3


def _wants_llm_intent() -> bool:
    """When true, try Bedrock JSON intent first; always falls back to rules on failure."""
    v = os.environ.get("SUPERVISOR_USE_LLM", "auto").strip().lower()
    if v in ("0", "false", "no", "rules", "regex"):
        return False
    if v in ("1", "true", "yes", "llm", "always"):
        return True
    stub = os.environ.get("AGENTS_STUB_LLM", "1").lower() in ("1", "true", "yes")
    return not stub


def _rules_orchestrate(req: OrchestrateRequest) -> OrchestrateResponse:
    msg = req.user_message.strip()
    if not msg:
        return OrchestrateResponse(route="blocked", reason="empty_message")

    if _COMPARE_HINTS.search(msg):
        return OrchestrateResponse(route="compare")

    if _SUMMARY_HINTS.search(msg):
        return OrchestrateResponse(route="summary")

    if req.document_url:
        return OrchestrateResponse(route="qna")

    return OrchestrateResponse(route="blocked", reason="missing_document_url_for_qna")


def _parse_llm_route_json(raw: str) -> OrchestrateResponse | None:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```\s*$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{[^{}]*\"route\"[^{}]*\}", text, re.DOTALL)
        if not m:
            return None
        try:
            data = json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    route = data.get("route")
    if route not in _VALID_ROUTES:
        return None
    reason = data.get("reason")
    if reason is not None and not isinstance(reason, str):
        reason = str(reason)
    return OrchestrateResponse(route=route, reason=reason)


def _llm_classify(req: OrchestrateRequest) -> OrchestrateResponse | None:
    if not _wants_llm_intent():
        return None

    from app.bedrock import converse_text

    system = (
        "You are a strict JSON intent router for a regulatory document assistant. Output exactly one JSON object, "
        'no markdown: {"route":"qna"|"summary"|"compare"|"blocked","reason":null or a short string}\n\n'
        "ROUTING RULES (read document_url line first):\n"
        "1) If document_url is **yes** (a URL is in scope): you **must not** return route **blocked** for normal "
        "business questions, paraphrases, or mild ambiguity. Pick **qna**, **compare**, or **summary** instead. "
        "Use **blocked** only for clearly disallowed / jailbreak content (same spirit as a safety classifier).\n"
        "2) With document_url **yes**, phrases like 'summarize the changes', 'overview of changes', "
        "'explain the updates', 'key changes' → **qna** when the user is asking for **policy content from one corpus** "
        "of retrieved snippets. However, 'compared to the official / prior extract and the modified version', "
        "'main differences between the two versions', 'redline the draft against the extract' → **compare** "
        "(two full document bodies attached by the caller).\n"
        "3) **compare** when the user wants a **diff, redline, side-by-side columns, or explicit two-version** narrative "
        "that normally needs **two full texts** (or the product diff UI). Not the same as a single-corpus definition "
        "question answerable only from retrieved snippets.\n"
        "4) **summary** only for **ingest / embedding-delta** style requests (chunk counts, added/removed previews from "
        "a pipeline run), not for generic 'summary of the document'.\n"
        "5) **qna** for obligations, penalties, definitions, 'what does section X say', and any document-content question "
        "answerable from retrieved text.\n"
        "6) If document_url is **no**: **blocked** if the message needs a document scope and is not self-contained; "
        "otherwise **qna** only if the question can stand alone.\n"
        "7) Never return **blocked** because the request is 'ambiguous' when document_url is **yes** — default to **qna**."
    )
    scope = "yes" if req.document_url else "no"
    user = f"document_url provided: {scope}\nuser_message:\n{req.user_message.strip()}"

    try:
        text, _mid, _stub = converse_text(system, user, max_tokens=200)
    except Exception as e:  # noqa: BLE001
        logger.warning("supervisor LLM classify failed: %s", e)
        return None

    parsed = _parse_llm_route_json(text)
    if parsed is None:
        logger.info("supervisor LLM returned unparseable route; using rules. raw=%s", text[:200])
    return parsed


def classify_intent(req: OrchestrateRequest) -> OrchestrateResponse:
    """
    Auto-identify intent from `user_message` (+ optional `document_url`).

    Order: (1) LLM JSON classification when enabled, (2) deterministic keyword rules.
    """
    msg = req.user_message.strip()
    if not msg:
        return OrchestrateResponse(route="blocked", reason="empty_message")

    llm_out = _llm_classify(req)
    if llm_out is not None:
        if (
            llm_out.route == "blocked"
            and req.document_url
            and msg
            and (llm_out.reason or "") != "empty_message"
        ):
            logger.info(
                "Supervisor LLM returned blocked with document scope; using keyword rules. llm_reason=%s",
                llm_out.reason,
            )
            return _rules_orchestrate(req)
        return llm_out
    return _rules_orchestrate(req)


async def classify_intent_async(req: OrchestrateRequest) -> OrchestrateResponse:
    """Async wrapper so Bedrock intent classification does not block the event loop."""
    return await asyncio.to_thread(classify_intent, req)


def orchestrate(req: OrchestrateRequest) -> OrchestrateResponse:
    """Backward-compatible name for tests and sync callers."""
    return classify_intent(req)
