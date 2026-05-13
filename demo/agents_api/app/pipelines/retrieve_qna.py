"""Retrieve chunks from Qdrant for a document URL, then run QnA + output guardrails."""

from __future__ import annotations

from typing import Literal

from app.agents.guardrails import validate_guardrails
from app.agents.qna import run_qna_agent
from app.qdrant_client import rank_chunks_keyword, scroll_chunks_for_document, section_refs_from_question
from app.schemas import ChunkContext, GuardrailsValidateRequest, QnAAgentRequest, QnAAgentResponse

RetrieveQnaOutcome = Literal["ok", "no_chunks", "output_blocked"]


async def retrieve_and_answer(
    *,
    message: str,
    document_url: str,
    qdrant_url: str,
    qdrant_collection: str,
    qdrant_api_key: str,
    top_k: int,
) -> tuple[RetrieveQnaOutcome, QnAAgentResponse | None, str | None]:
    chunks_raw = await scroll_chunks_for_document(
        qdrant_url=qdrant_url,
        collection=qdrant_collection,
        document_url=document_url,
        api_key=qdrant_api_key,
    )
    effective_k = top_k
    if section_refs_from_question(message):
        effective_k = min(max(top_k, 20), 32)
    ranked = rank_chunks_keyword(message, chunks_raw, effective_k)
    if not ranked:
        return "no_chunks", None, None
    qreq = QnAAgentRequest(
        question=message,
        document_url=document_url,
        chunks=[
            ChunkContext(chunk_index=int(c["chunk_index"]), content=str(c["content"])) for c in ranked
        ],
    )
    ans = await run_qna_agent(qreq)
    g1 = validate_guardrails(
        GuardrailsValidateRequest(
            phase="output",
            text=ans.answer,
            require_chunk_citations=True,
        )
    )
    if not g1.allowed:
        return "output_blocked", None, g1.reason
    return "ok", ans, None
