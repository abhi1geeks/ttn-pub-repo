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
    model_config = ConfigDict(populate_by_name=True)

    run_point_id: str = Field(..., alias="runPointId")
    document_url: str = Field(..., alias="documentUrl")
    version_id: str = Field(..., alias="versionId")
    document_hash: str | None = Field(default=None, alias="documentHash")
    summary: dict[str, Any]
    added_preview: list[str] = Field(default_factory=list, alias="addedPreview")
    removed_preview: list[str] = Field(default_factory=list, alias="removedPreview")
    target_language: Literal["en", "es", "de", "fr"] = Field(
        default="en",
        alias="targetLanguage",
        description="ISO-style output language for executive + materiality paragraphs (CSV 2.1 demo).",
    )


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
    user_display_name: str | None = Field(
        default=None,
        max_length=64,
        description="Optional session display name for conversational greetings (not sent to RAG).",
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


# --- GLI CSV 2.3 / 2.4 demo agents -------------------------------------------------


class JurisdictionSnippet(BaseModel):
    """One jurisdiction column for cross-jurisdiction compare (user-supplied excerpts)."""

    model_config = ConfigDict(populate_by_name=True)

    label: str = Field(..., min_length=1, max_length=240)
    content: str = Field(..., min_length=20, max_length=24_000)
    document_url: str | None = Field(
        default=None,
        max_length=2000,
        alias="documentUrl",
        description="Optional canonical URL for audit trail in the client only.",
    )


class CrossJurisdictionCompareRequest(BaseModel):
    """CSV 2.3 — compare excerpts across jurisdictions on one topic."""

    model_config = ConfigDict(populate_by_name=True)

    topic: str = Field(..., min_length=4, max_length=4000)
    snippets: list[JurisdictionSnippet] = Field(..., min_length=2, max_length=4)
    debug: bool = False


class CrossJurisdictionCompareResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    headline: str
    markdown_table: str = Field(alias="markdownTable")
    narrative: str
    model_id: str = Field(alias="modelId")
    stub: bool = False
    raw_model_text: str | None = Field(
        default=None,
        alias="rawModelText",
        description="When JSON parse fails, original model output for troubleshooting.",
    )


class GapItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str = Field(..., max_length=400)
    severity: Literal["low", "medium", "high"]
    description: str = Field(..., max_length=4000)
    recommended_action: str = Field(..., max_length=4000, alias="recommendedAction")


class GapAnalysisRequest(BaseModel):
    """CSV 2.4 — certification-style profile vs new regulatory text."""

    model_config = ConfigDict(populate_by_name=True)

    certification_profile: str = Field(
        ...,
        min_length=20,
        max_length=24_000,
        alias="certificationProfile",
        description="Bullets or checklist describing current certification / product obligations (demo).",
    )
    regulatory_change_text: str = Field(
        ...,
        min_length=20,
        max_length=48_000,
        alias="regulatoryChangeText",
        description="New or updated regulatory excerpt to diff against the profile.",
    )
    product_line: str | None = Field(default=None, max_length=200, alias="productLine")
    debug: bool = False


class GapAnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    executive_summary: str = Field(alias="executiveSummary")
    gaps: list[GapItem] = Field(default_factory=list, max_length=24)
    model_id: str = Field(alias="modelId")
    stub: bool = False
    raw_model_text: str | None = Field(default=None, alias="rawModelText")


class AlertTriageRequest(BaseModel):
    """CSV 1.3 — alert relevance, tags, and routing queue suggestion."""

    model_config = ConfigDict(populate_by_name=True)

    materiality_score: int | None = Field(
        default=None,
        ge=1,
        le=5,
        alias="materialityScore",
        description="UC1-005 materiality 1–5 when available.",
    )
    executive_summary: str | None = Field(default=None, max_length=8000, alias="executiveSummary")
    materiality_notes: str | None = Field(default=None, max_length=8000, alias="materialityNotes")
    product_line: str | None = Field(default=None, max_length=200, alias="productLine")
    jurisdiction: str | None = Field(default=None, max_length=200)
    effective_date: str | None = Field(default=None, max_length=80, alias="effectiveDate")
    new_chunks: int = Field(default=0, ge=0, alias="newChunks")
    removed_chunks: int = Field(default=0, ge=0, alias="removedChunks")


class AlertTriageResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    relevance_tier: Literal["low", "medium", "high"] = Field(alias="relevanceTier")
    routing_queue: str = Field(alias="routingQueue")
    tags: list[str] = Field(default_factory=list, max_length=12)
    rationale: str
    model_id: str = Field(alias="modelId")
    stub: bool = False
    raw_model_text: str | None = Field(default=None, alias="rawModelText")


class IngestProcessRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_url: str = Field(alias="documentUrl")
    version_id: str = Field(alias="versionId")
    pdf_path: str = Field(alias="pdfPath")
    url_hash: str | None = Field(default=None, alias="urlHash")


class ArtifactRef(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    path: str
    page_count: int | None = Field(default=None, alias="pageCount")


class ChangeRegion(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    page: int
    kind: Literal["insert", "delete", "replace"]
    bbox: list[float]
    excerpt: str | None = None


class AlignedChange(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    kind: Literal["inserted", "deleted", "modified", "moved"]
    similarity: float = 0.0
    baseline_page: int | None = Field(default=None, alias="baselinePage")
    current_page: int | None = Field(default=None, alias="currentPage")
    baseline_block_id: str | None = Field(default=None, alias="baselineBlockId")
    current_block_id: str | None = Field(default=None, alias="currentBlockId")
    baseline_bbox: list[float] | None = Field(default=None, alias="baselineBbox")
    current_bbox: list[float] | None = Field(default=None, alias="currentBbox")
    baseline_excerpt: str = Field(default="", alias="baselineExcerpt")
    current_excerpt: str = Field(default="", alias="currentExcerpt")


class AlignedChangesSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    inserted: int = 0
    deleted: int = 0
    modified: int = 0
    moved: int = 0


class IngestProcessResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    layout_artifact: ArtifactRef = Field(alias="layoutArtifact")
    change_regions: list[ChangeRegion] = Field(default_factory=list, alias="changeRegions")
    aligned_changes: list[AlignedChange] = Field(default_factory=list, alias="alignedChanges")
    aligned_summary: AlignedChangesSummary | None = Field(default=None, alias="alignedSummary")
    baseline_version_id: str | None = Field(default=None, alias="baselineVersionId")
    diff_artifact: ArtifactRef | None = Field(default=None, alias="diffArtifact")
    aligned_artifact: ArtifactRef | None = Field(default=None, alias="alignedArtifact")


class IngestDiffRegionsRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_url: str = Field(alias="documentUrl")
    baseline_version_id: str = Field(alias="baselineVersionId")
    current_version_id: str = Field(alias="currentVersionId")
    url_hash: str | None = Field(default=None, alias="urlHash")


class IngestDiffRegionsResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    change_regions: list[ChangeRegion] = Field(default_factory=list, alias="changeRegions")
    baseline_version_id: str = Field(alias="baselineVersionId")
    current_version_id: str = Field(alias="currentVersionId")


class IngestAlignedChangesRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    document_url: str = Field(alias="documentUrl")
    baseline_version_id: str = Field(alias="baselineVersionId")
    current_version_id: str = Field(alias="currentVersionId")
    url_hash: str | None = Field(default=None, alias="urlHash")


class IngestAlignedChangesResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    aligned_changes: list[AlignedChange] = Field(default_factory=list, alias="alignedChanges")
    summary: AlignedChangesSummary
    baseline_version_id: str = Field(alias="baselineVersionId")
    current_version_id: str = Field(alias="currentVersionId")
