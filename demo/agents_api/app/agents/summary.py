"""UC1-005 style ingest summary from chunk delta context."""

from __future__ import annotations

import re

from app.bedrock import converse_text
from app.schemas import SummaryAgentRequest, SummaryAgentResponse

_SCORE_LINE = re.compile(r"^\s*SCORE:\s*([1-5])\s*$", re.IGNORECASE | re.MULTILINE)


def _clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 3] + "..."


def _strip_trailing_score_lines(text: str) -> tuple[str, int | None]:
    """Remove trailing `SCORE: N` lines; return cleaned text and score from the bottom-most such line."""
    body = text.strip()
    score: int | None = None
    while True:
        lines = body.split("\n")
        if not lines:
            break
        last = lines[-1].strip()
        m = _SCORE_LINE.match(last)
        if not m:
            break
        if score is None:
            score = int(m.group(1))
        lines.pop()
        body = "\n".join(lines).rstrip()
    return body, score


def _split_llm_materiality(cleaned: str) -> tuple[str, str]:
    parts = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return cleaned.strip(), ""


async def run_summary_agent(req: SummaryAgentRequest) -> SummaryAgentResponse:
    s = req.summary
    added_n = int(s.get("newChunks") or 0)
    removed_n = int(s.get("removedChunks") or 0)
    if added_n == 0 and removed_n == 0:
        return SummaryAgentResponse(
            llm_summary="No embedding delta in this ingest; document text may still match prior hash.",
            materiality_notes="Chunk set unchanged — review full-text diff in the UC1 web UI if the PDF hash changed.",
            model_id="none",
            stub=True,
            materiality_score=1,
        )

    added_lines = "\n".join(f"- {_clip(x, 400)}" for x in req.added_preview[:5])
    removed_lines = "\n".join(f"- {_clip(x, 400)}" for x in req.removed_preview[:5])
    user = (
        f"document_url={req.document_url}\n"
        f"version_id={req.version_id}\n"
        f"document_hash={req.document_hash or 'unknown'}\n"
        f"delta: new_chunks={added_n}, removed_chunks={removed_n}, "
        f"total_chunks={s.get('totalChunks')}, unchanged={s.get('unchangedChunks')}\n\n"
        f"Sample new chunk excerpts:\n{added_lines or '(none)'}\n\n"
        f"Sample removed chunk excerpts:\n{removed_lines or '(none)'}\n\n"
        "Respond with TWO short paragraphs: (1) executive summary of what likely changed "
        "for a gaming compliance officer, (2) materiality / follow-up notes. "
        "Do not invent citations; speak only from the excerpts and counts.\n\n"
        "After those paragraphs, add one final line exactly in this form (nothing after it): "
        "SCORE: N — where N is a single digit from 1 (cosmetic / likely immaterial) through 5 "
        "(likely material for GLI-style gaming compliance follow-up)."
    )
    system = (
        "You are a regulatory change analyst for gaming compliance (GLI-style context). "
        "Be precise; if excerpts are insufficient, say what is unknown."
    )
    text, mid, stub = converse_text(system, user, max_tokens=700)
    if stub:
        text = (
            f"[stub-llm] Chunk delta +{added_n} added / {removed_n} removed vs prior snapshot; "
            "set AGENTS_STUB_LLM=0 and AWS credentials for a Bedrock narrative.\n\n"
            "POC placeholder: validate any operational takeaway in the diff tab and source PDF.\n\n"
            "SCORE: 3"
        )
    cleaned, score = _strip_trailing_score_lines(text)
    llm, mat = _split_llm_materiality(cleaned)
    return SummaryAgentResponse(
        llm_summary=llm,
        materiality_notes=mat,
        model_id=mid,
        stub=stub,
        materiality_score=score,
    )
