"""FastAPI entry: regulatory multi-agent service."""

from __future__ import annotations

import logging
import os
import uuid

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from app.agents.agentic_workflow import run_agentic_workflow
from app.agents.compare import run_compare_agent
from app.agents.alert_triage import run_alert_triage
from app.agents.cross_jurisdiction import run_cross_jurisdiction_compare
from app.agents.gap_analysis import run_gap_analysis
from app.agents.guardrails import (
    first_compare_agent_request_policy_violation,
    first_summary_input_policy_violation,
    validate_guardrails,
)
from app.agents.qna import run_qna_agent
from app.agents.summary import run_summary_agent
from app.agents.supervisor import classify_intent_async
from app.pipelines.chat_triage import trivial_chat_reply
from app.pipelines.retrieve_qna import retrieve_and_answer
from app.ingest.process import aligned_changes_for_versions, diff_regions_for_versions, process_ingest_artifacts
from app.schemas import (
    AgenticWorkflowRequest,
    AgenticWorkflowResponse,
    ChatPipelineRequest,
    ChatPipelineResponse,
    CompareAgentRequest,
    CompareAgentResponse,
    AlertTriageRequest,
    AlertTriageResponse,
    CrossJurisdictionCompareRequest,
    CrossJurisdictionCompareResponse,
    GapAnalysisRequest,
    GapAnalysisResponse,
    GuardrailsValidateRequest,
    GuardrailsValidateResponse,
    HealthResponse,
    IngestAlignedChangesRequest,
    IngestAlignedChangesResponse,
    AlignedChangesSummary,
    IngestDiffRegionsRequest,
    IngestDiffRegionsResponse,
    IngestProcessRequest,
    IngestProcessResponse,
    OrchestrateRequest,
    OrchestrateResponse,
    QnAAgentRequest,
    QnAAgentResponse,
    SummaryAgentRequest,
    SummaryAgentResponse,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Regulatory agents API", version="1.0.0")


@app.middleware("http")
async def request_id_header(request: Request, call_next):
    rid = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = rid
    response = await call_next(request)
    response.headers["X-Request-Id"] = rid
    return response


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    stub = os.environ.get("AGENTS_STUB_LLM", "1").lower() in ("1", "true", "yes")
    return HealthResponse(ok=True, stub_llm=stub)


@app.post("/v1/ingest/process", response_model=IngestProcessResponse)
async def ingest_process(body: IngestProcessRequest) -> IngestProcessResponse:
    try:
        out = process_ingest_artifacts(
            document_url=body.document_url,
            version_id=body.version_id,
            pdf_rel_path=body.pdf_path,
            url_hash=body.url_hash,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception("ingest/process failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    return IngestProcessResponse.model_validate(out)


@app.post("/v1/ingest/diff-regions", response_model=IngestDiffRegionsResponse)
async def ingest_diff_regions(body: IngestDiffRegionsRequest) -> IngestDiffRegionsResponse:
    try:
        out = diff_regions_for_versions(
            document_url=body.document_url,
            baseline_version_id=body.baseline_version_id,
            current_version_id=body.current_version_id,
            url_hash=body.url_hash,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception("ingest/diff-regions failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    return IngestDiffRegionsResponse.model_validate(out)


@app.post("/v1/ingest/aligned-changes", response_model=IngestAlignedChangesResponse)
async def ingest_aligned_changes(body: IngestAlignedChangesRequest) -> IngestAlignedChangesResponse:
    try:
        out = aligned_changes_for_versions(
            document_url=body.document_url,
            baseline_version_id=body.baseline_version_id,
            current_version_id=body.current_version_id,
            url_hash=body.url_hash,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        logger.exception("ingest/aligned-changes failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e)) from e
    return IngestAlignedChangesResponse(
        aligned_changes=out["alignedChanges"],
        summary=AlignedChangesSummary.model_validate(out["summary"]),
        baseline_version_id=out["baselineVersionId"],
        current_version_id=out["currentVersionId"],
    )


@app.post("/v1/guardrails/validate", response_model=GuardrailsValidateResponse)
async def guardrails_validate(body: GuardrailsValidateRequest) -> GuardrailsValidateResponse:
    return validate_guardrails(body)


@app.post("/v1/orchestrate", response_model=OrchestrateResponse)
async def orchestrate_route(body: OrchestrateRequest) -> OrchestrateResponse:
    g_in = validate_guardrails(
        GuardrailsValidateRequest(phase="input", text=body.user_message, require_chunk_citations=False)
    )
    if not g_in.allowed:
        return OrchestrateResponse(route="blocked", reason=g_in.reason)
    return await classify_intent_async(body)


@app.post("/v1/agents/summary", response_model=SummaryAgentResponse)
async def summary_route(body: SummaryAgentRequest) -> SummaryAgentResponse:
    v = first_summary_input_policy_violation(body)
    if v is not None:
        raise HTTPException(status_code=400, detail={"error": "input_policy", "reason": v})
    return await run_summary_agent(body)


@app.post("/v1/agents/qna", response_model=QnAAgentResponse)
async def qna_route(body: QnAAgentRequest) -> QnAAgentResponse:
    g_in = validate_guardrails(
        GuardrailsValidateRequest(phase="input", text=body.question, require_chunk_citations=False)
    )
    if not g_in.allowed:
        raise HTTPException(status_code=400, detail={"error": "input_policy", "reason": g_in.reason})
    return await run_qna_agent(body)


@app.post("/v1/agents/compare", response_model=CompareAgentResponse)
async def compare_route(body: CompareAgentRequest) -> CompareAgentResponse:
    v = first_compare_agent_request_policy_violation(body)
    if v is not None:
        raise HTTPException(status_code=400, detail={"error": "input_policy", "reason": v})
    return await run_compare_agent(body)


@app.post("/v1/agents/cross-jurisdiction", response_model=CrossJurisdictionCompareResponse)
async def cross_jurisdiction_route(body: CrossJurisdictionCompareRequest) -> CrossJurisdictionCompareResponse:
    blob = f"{body.topic}\n" + "\n".join(f"{s.label}\n{s.content}" for s in body.snippets)
    g_in = validate_guardrails(
        GuardrailsValidateRequest(phase="input", text=blob[:16_000], require_chunk_citations=False)
    )
    if not g_in.allowed:
        raise HTTPException(status_code=400, detail={"error": "input_policy", "reason": g_in.reason})
    return await run_cross_jurisdiction_compare(body)


@app.post("/v1/agents/alert-triage", response_model=AlertTriageResponse)
async def alert_triage_route(body: AlertTriageRequest) -> AlertTriageResponse:
    blob = "\n".join(
        x
        for x in (
            body.executive_summary,
            body.materiality_notes,
            body.product_line,
            body.jurisdiction,
        )
        if x
    )
    if blob.strip():
        g_in = validate_guardrails(
            GuardrailsValidateRequest(phase="input", text=blob[:16_000], require_chunk_citations=False)
        )
        if not g_in.allowed:
            raise HTTPException(status_code=400, detail={"error": "input_policy", "reason": g_in.reason})
    return await run_alert_triage(body)


@app.post("/v1/agents/gap-analysis", response_model=GapAnalysisResponse)
async def gap_analysis_route(body: GapAnalysisRequest) -> GapAnalysisResponse:
    blob = f"{body.certification_profile}\n{body.regulatory_change_text}"
    g_in = validate_guardrails(
        GuardrailsValidateRequest(phase="input", text=blob[:16_000], require_chunk_citations=False)
    )
    if not g_in.allowed:
        raise HTTPException(status_code=400, detail={"error": "input_policy", "reason": g_in.reason})
    return await run_gap_analysis(body)


@app.post("/v1/workflow/agentic", response_model=AgenticWorkflowResponse)
async def agentic_workflow_route(body: AgenticWorkflowRequest) -> AgenticWorkflowResponse:
    """Supervisor classifies `query`, then runs Summary (1), Comparison (2), or QnA (3) when inputs allow."""
    return await run_agentic_workflow(body)


@app.post("/v1/pipelines/chat", response_model=ChatPipelineResponse)
async def chat_pipeline(
    body: ChatPipelineRequest,
    x_request_id: str | None = Header(default=None, alias="X-Request-Id"),
) -> ChatPipelineResponse:
    g0 = validate_guardrails(
        GuardrailsValidateRequest(phase="input", text=body.message, require_chunk_citations=False)
    )
    if not g0.allowed:
        return ChatPipelineResponse(
            reply="I cannot process this message (policy).",
            route="blocked",
            blocked=True,
            reason=g0.reason,
        )

    canned = trivial_chat_reply(body.message)
    if canned is not None:
        return ChatPipelineResponse(reply=canned, route="conversational", blocked=False)

    orch = await classify_intent_async(
        OrchestrateRequest(user_message=body.message, document_url=body.document_url or None)
    )
    if orch.route == "blocked":
        return ChatPipelineResponse(
            reply="Ask a question about the indexed document, or include a document URL scope.",
            route="blocked",
            blocked=True,
            reason=orch.reason,
        )
    if not body.force_qna and orch.route in ("compare", "summary"):
        return ChatPipelineResponse(
            reply=(
                "This chat path answers questions from retrieved chunks (QnA). "
                "For compare/summary, call POST /v1/agents/compare or wait for ingest summary."
            ),
            route=orch.route,
        )

    outcome, qna_ans, out_reason = await retrieve_and_answer(
        message=body.message,
        document_url=body.document_url,
        qdrant_url=body.qdrant_url,
        qdrant_collection=body.qdrant_collection,
        qdrant_api_key=body.qdrant_api_key,
        top_k=body.top_k,
    )
    if outcome == "no_chunks":
        return ChatPipelineResponse(
            reply="No indexed chunks found for this document_url in Qdrant.",
            route="qna",
            blocked=False,
        )
    if outcome == "output_blocked":
        return ChatPipelineResponse(
            reply="Answer failed output policy (citations).",
            route="qna",
            blocked=True,
            reason=out_reason,
        )
    assert qna_ans is not None
    return ChatPipelineResponse(reply=qna_ans.answer, route="qna", blocked=False)


@app.exception_handler(Exception)
async def unhandled(_, exc: Exception):
    logger.exception("unhandled: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "internal_error"})
