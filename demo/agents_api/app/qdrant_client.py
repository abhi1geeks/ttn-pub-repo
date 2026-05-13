"""Minimal Qdrant scroll helper (retrieve-then-answer)."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)


async def scroll_chunks_for_document(
    *,
    qdrant_url: str,
    collection: str,
    document_url: str,
    api_key: str = "",
    limit: int = 10_000,
) -> list[dict[str, Any]]:
    base = qdrant_url.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["api-key"] = api_key
    body = {
        "filter": {"must": [{"key": "metadata.documentUrl", "match": {"value": document_url}}]},
        "limit": limit,
        "with_payload": True,
        "with_vector": False,
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(f"{base}/collections/{collection}/points/scroll", json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
    points = (data.get("result") or {}).get("points") or []
    out: list[dict[str, Any]] = []
    for p in points:
        pl = p.get("payload") or {}
        meta = pl.get("metadata") or {}
        out.append(
            {
                "id": p.get("id"),
                "chunk_index": int(meta.get("chunkIndex", -1)),
                "content": str(pl.get("content") or ""),
            }
        )
    return out


def section_refs_from_question(question: str) -> list[str]:
    """NV-style regulation labels (14.0305, 14.030(1), …) for retrieval boosting."""
    refs: list[str] = []
    for pat in (r"\b\d{1,3}\.\d{2,6}[a-z]?\b", r"\b\d{1,3}\.\d{2,4}\(\d+\)(?:\([a-z]\))?\b"):
        for m in re.finditer(pat, question, re.I):
            s = m.group(0).lower()
            if s not in refs:
                refs.append(s)
    return refs


def rank_chunks_keyword(question: str, chunks: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
    """Cheap overlap score: query tokens in chunk + strong bonus when section numbers appear verbatim (POC)."""
    low_q = question.lower()
    section_refs = section_refs_from_question(question)
    qtok = {t.lower().strip(".,;:!?()[]\"'") for t in question.split() if len(t.strip(".,;:!?()[]\"'")) > 2}
    if not qtok:
        qtok = {low_q[:64]}
    for ref in section_refs:
        qtok.add(ref)

    scored: list[tuple[float, dict[str, Any]]] = []
    for c in chunks:
        text = c.get("content") or ""
        low = text.lower()
        score = float(sum(1 for t in qtok if t and t in low))
        for ref in section_refs:
            if ref in low:
                score += 25.0
        scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    return [c for _, c in scored[:top_k]]
