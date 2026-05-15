"""Pydantic contracts for agent HTTP API (v1)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    ok: bool = True
    service: str = "regulatory-agents"
    stub_llm: bool = False


class GuardrailsValidateRequest(BaseModel):
    phase: Literal["input", "output"]
    text: str | None = None
    """User message or model plain-text answer (QnA)."""
    summary_json: dict[str, Any] | None = None
    """Structured SummaryAgent output for schema checks."""
    require_chunk_citations: bool = False
    """When true, `text` must contain [chunk:N] markers."""


class GuardrailsValidateResponse(BaseModel):
    allowed: bool
    reason: str | None = None


class OrchestrateRequest(BaseModel):
    user_message: str = Field(..., min_length=1, max_length=16_000)
    document_url: str | None = None
    full_compare_texts_attached: bool = Field(
        default=False,
        description="Caller attached baseline+current full bodies — supervisor should weigh compare vs qna.",
    )
    ingest_delta_context_attached: bool = Field(
        default=False,
        description="Caller attached ingest / chunk-delta payload for SummaryAgent — prefer summary for delta asks.",
    )


class OrchestrateResponse(BaseModel):
    route: Literal["qna", "summary", "compare", "blocked"]
    reason: str | None = None


class ChunkContext(BaseModel):
    chunk_index: int
    content: str


class SummaryAgentRequest(BaseModel):
    run_point_id: str
    document_url: str
    version_id: str
    document_hash: str | None = None
    summary: dict[str, Any]
    added_preview: list[str] = Field(default_factory=list)
    removed_preview: list[str] = Field(default_factory=list)


class SummaryAgentResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    llm_summary: str = Field(alias="llmSummary")
    materiality_notes: str = Field(alias="materialityNotes")
    model_id: str
    stub: bool = False
    materiality_score: int | None = Field(
        default=None,
        alias="materialityScore",
        ge=1,
        le=5,
        description="1=cosmetic / noise … 5=likely material for GLI-style gaming compliance follow-up.",
    )


class QnAAgentRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=8_000)
    document_url: str
    chunks: list[ChunkContext] = Field(..., min_length=1, max_length=32)


class QnAAgentResponse(BaseModel):
    answer: str
    cited_chunk_indices: list[int]
    model_id: str
    stub: bool = False


class CompareChunkDelta(BaseModel):
    """One chunk-level signal from ingest (embedding / content-hash delta), not full-document proof."""

    kind: Literal["added", "removed"]
    chunk_index: int | None = Field(
        default=None,
        description="Chunk index from run metadata when present.",
    )
    excerpt: str = Field(..., max_length=4000)


class CompareAgentRequest(BaseModel):
    baseline_text: str = Field(..., max_length=500_000)
    current_text: str = Field(..., max_length=500_000)
    max_chars: int = Field(default=12_000, ge=1000, le=100_000)
    chunk_changes: list[CompareChunkDelta] = Field(
        default_factory=list,
        max_length=48,
        description="Optional ingest delta chunk excerpts (added vs removed) for side-by-side style prompts.",
    )
    user_question: str | None = Field(
        default=None,
        max_length=16_000,
        description="Original user message — used to tune list vs narrative output.",
    )
    debug: bool = Field(
        default=False,
        description="If true, include debug_meta on the response (prompt size signals, page split flags).",
    )


class CompareAgentResponse(BaseModel):
    headline: str
    narrative: str
    model_id: str
    stub: bool = False
    debug_meta: dict[str, Any] | None = Field(
        default=None,
        description="When CompareAgentRequest.debug is true: prompt/shape stats for troubleshooting.",
    )


class ChatPipelineRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=16_000)
    document_url: str
    qdrant_url: str = "http://qdrant:6333"
    qdrant_collection: str = "regulatory_docs"
    qdrant_api_key: str = ""
    top_k: int = Field(default=8, ge=1, le=32)
    force_qna: bool = Field(
        default=False,
        description="If true, skip compare/summary supervisor short-circuit and always run retrieve → QnA.",
    )


class ChatPipelineResponse(BaseModel):
    reply: str
    route: str
    blocked: bool = False
    reason: str | None = None


class CompareContext(BaseModel):
    """Baseline vs current full text for comparison intent (intent 2)."""

    baseline_text: str = Field(..., min_length=1, max_length=500_000)
    current_text: str = Field(..., min_length=1, max_length=500_000)
    max_chars: int = Field(default=12_000, ge=1000, le=100_000)
    chunk_changes: list[CompareChunkDelta] = Field(
        default_factory=list,
        max_length=48,
        description="Optional added/removed chunk excerpts from the current ingest run (steers compare narrative).",
    )


class AgenticWorkflowRequest(BaseModel):
    """Single entry: supervisor classifies query, then runs the matching agent when context is present."""

    query: str = Field(..., min_length=1, max_length=16_000)
    document_url: str | None = None
    qdrant_url: str = "http://qdrant:6333"
    qdrant_collection: str = "regulatory_docs"
    qdrant_api_key: str = ""
    top_k: int = Field(default=8, ge=1, le=32)
    summary_context: SummaryAgentRequest | None = Field(
        default=None,
        description="When intent is summary (1), supply ingest delta payload to run SummaryAgent.",
    )
    compare_context: CompareContext | None = Field(
        default=None,
        description="When intent is comparison (2), supply two texts to run CompareAgent.",
    )
    force_qna: bool = Field(
        default=False,
        description="If true, skip compare-with-full-text shortcut and skip Summary/Compare agents; always run QnA retrieval.",
    )
    debug: bool = Field(
        default=False,
        description="If true, response includes debug_trace with routing and retrieval diagnostics (no secrets).",
    )


class AgenticWorkflowResponse(BaseModel):
    intent: Literal["summary", "comparison", "qna", "blocked"]
    intent_id: Literal[0, 1, 2, 3]
    supervisor_route: str
    blocked: bool = False
    reason: str | None = None
    executed: bool = False
    needs_input: list[str] = Field(default_factory=list)
    summary: SummaryAgentResponse | None = None
    comparison: CompareAgentResponse | None = None
    qna: QnAAgentResponse | None = None
    fallback_from: str | None = Field(
        default=None,
        description="Supervisor chose compare/summary/blocked without runnable payload; QnA from chunks ran instead.",
    )
    debug_trace: dict[str, Any] | None = Field(
        default=None,
        description="Present when request.debug is true: orchestration and branch diagnostics.",
    )
    suggested_followups: list[str] = Field(
        default_factory=list,
        max_length=8,
        description="Short suggested next user questions for the chat UI, derived from the query and response shape.",
    )
