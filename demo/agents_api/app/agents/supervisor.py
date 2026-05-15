"""Supervisor routing: auto intent from user message (LLM when enabled, else rules)."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from typing import Literal

from app.agents.agent_definitions import supervisor_llm_system_prompt
from app.agents.routing_signals import (
    compare_cross_version_question,
    requires_full_text_compare_presentation,
    rules_compare_route_message,
    rules_summary_route_message,
)
from app.schemas import OrchestrateRequest, OrchestrateResponse

logger = logging.getLogger(__name__)

_SUPERVISOR_ROUTE = Literal["qna", "summary", "compare", "blocked"]
_VALID_ROUTES = frozenset({"qna", "summary", "compare", "blocked"})


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

    if req.full_compare_texts_attached and (
        compare_cross_version_question(msg) or requires_full_text_compare_presentation(msg)
    ):
        return OrchestrateResponse(route="compare", reason="attachment_cross_version_signal")

    if rules_compare_route_message(msg):
        return OrchestrateResponse(route="compare")

    if req.ingest_delta_context_attached and rules_summary_route_message(msg):
        return OrchestrateResponse(route="summary", reason="attachment_ingest_summary_signal")

    if rules_summary_route_message(msg):
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


def _orchestrate_user_block(req: OrchestrateRequest) -> str:
    scope = "yes" if req.document_url else "no"
    fcmp = "yes" if req.full_compare_texts_attached else "no"
    ing = "yes" if req.ingest_delta_context_attached else "no"
    return (
        f"signals:\n"
        f"  document_url_provided: {scope}\n"
        f"  full_compare_texts_attached: {fcmp}\n"
        f"  ingest_delta_context_attached: {ing}\n"
        f"user_message:\n{req.user_message.strip()}"
    )


def _llm_classify(req: OrchestrateRequest) -> OrchestrateResponse | None:
    if not _wants_llm_intent():
        return None

    from app.bedrock import converse_text

    system = supervisor_llm_system_prompt()
    user = _orchestrate_user_block(req)

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
    Identify intent from `user_message`, optional `document_url`, and attachment signals.

    Attachment flags (`full_compare_texts_attached`, `ingest_delta_context_attached`) steer routing
    when the LLM is off (stub/dev) and enrich the LLM router prompt when on.

    Order: (1) LLM JSON classification when enabled, (2) deterministic rules fallback.
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
