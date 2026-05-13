"""Optional Bedrock Converse API; falls back to stub text when unavailable."""

from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def _use_stub() -> bool:
    return os.environ.get("AGENTS_STUB_LLM", "").lower() in ("1", "true", "yes")


def _client():
    try:
        import boto3  # noqa: WPS433

        return boto3.client(
            "bedrock-runtime",
            region_name=os.environ.get("AWS_REGION", "us-east-1"),
        )
    except Exception as e:  # noqa: BLE001
        logger.warning("boto3 bedrock client unavailable: %s", e)
        return None


def converse_text(
    system: str,
    user: str,
    *,
    model_id: str | None = None,
    max_tokens: int = 1024,
) -> tuple[str, str, bool]:
    """Return (text, model_id, stub)."""
    mid = model_id or os.environ.get(
        "BEDROCK_CHAT_MODEL_ID",
        "amazon.nova-pro-v1:0",
    )
    if _use_stub():
        return (
            f"[stub-llm] Model={mid}. User chars={len(user)}. "
            "Set AGENTS_STUB_LLM=0 and AWS credentials for live Bedrock.",
            mid,
            True,
        )

    client = _client()
    if client is None:
        return (
            "[stub-llm] boto3 unavailable. Export AWS_REGION and credentials.",
            mid,
            True,
        )

    try:
        if "anthropic." in mid:
            body: dict[str, Any] = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "system": system,
                "messages": [{"role": "user", "content": [{"type": "text", "text": user}]}],
            }
            resp = client.invoke_model(modelId=mid, body=json.dumps(body).encode("utf-8"))
            payload = json.loads(resp["body"].read())
            parts = payload.get("content") or []
            texts = [p.get("text", "") for p in parts if p.get("type") == "text"]
            return "".join(texts).strip() or "[empty model response]", mid, False

        # Amazon Nova (and other non-Anthropic chat models): unified Converse API
        resp = client.converse(
            modelId=mid,
            messages=[{"role": "user", "content": [{"text": user}]}],
            system=[{"text": system}],
            inferenceConfig={"maxTokens": max_tokens},
        )
        parts = (resp.get("output") or {}).get("message", {}).get("content") or []
        texts: list[str] = []
        for block in parts:
            if isinstance(block, dict) and "text" in block:
                texts.append(str(block["text"]))
        return "".join(texts).strip() or "[empty model response]", mid, False
    except Exception as e:  # noqa: BLE001
        logger.exception("bedrock invoke failed: %s", e)
        return f"[stub-llm] Bedrock error: {e!s}", mid, True
