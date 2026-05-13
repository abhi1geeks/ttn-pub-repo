"""UC2-002 QnA over provided chunks only (retrieve-then-answer)."""

from __future__ import annotations

from app.agents.guardrails import enforce_qna_citations
from app.bedrock import converse_text
from app.schemas import ChunkContext, QnAAgentRequest, QnAAgentResponse


async def run_qna_agent(req: QnAAgentRequest) -> QnAAgentResponse:
    valid = {c.chunk_index for c in req.chunks}
    ctx = "\n\n".join(
        f"[chunk:{c.chunk_index}]\n{_clip(c.content, 3500)}" for c in req.chunks
    )
    user = (
        f"document_url={req.document_url}\n"
        f"question={req.question}\n\n"
        "Context excerpts (ground truth — cite using exactly [chunk:N] from headers):\n"
        f"{ctx}\n\n"
        "Answer concisely. Every factual claim must end with one or more [chunk:N] markers "
        "that support it. If context is insufficient, say so and cite the closest chunk."
    )
    system = (
        "You are a regulatory assistant. Never fabricate citations; only use provided chunk markers.\n"
        "If the question references a **numbered regulation section** (e.g. 14.0305, 14.030(1)), scan **every** excerpt "
        "for that exact designation (substring match) before stating the section does not appear; if still absent after "
        "checking all excerpts, say the indexed chunks shown do not contain it and cite the closest related section.\n"
        "If the user asks for **side-by-side columns**, a **redline of two full PDFs**, or a **full-text diff** but you "
        "only have excerpts from one indexed retrieval (not two complete documents), say clearly: (1) use the product "
        "**Readable diff** tab when two ingested runs are available, or (2) supply **baseline and current full text** "
        "for the compare workflow. Then, if excerpts still help, briefly describe what they suggest about changes — "
        "with [chunk:N] citations — without claiming you produced a true two-column diff."
    )
    text, mid, stub = converse_text(system, user, max_tokens=900)
    fixed, cites = enforce_qna_citations(text, valid)
    return QnAAgentResponse(answer=fixed, cited_chunk_indices=cites, model_id=mid, stub=stub)


def _clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 3] + "..."
