"""UC1-005 style ingest summary from chunk delta context."""

from __future__ import annotations

import re

from app.agents.agent_definitions import summary_system_prompt
from app.bedrock import bedrock_failure_message, bedrock_unavailable_user_message, converse_text
from app.schemas import SummaryAgentRequest, SummaryAgentResponse

_SCORE_LINE = re.compile(r"^\s*SCORE:\s*([1-5])\s*$", re.IGNORECASE | re.MULTILINE)

_OUTPUT_LANG_HINT: dict[str, str] = {
    "en": "Write both paragraphs in English.",
    "es": "Write both paragraphs in Spanish (español).",
    "de": "Write both paragraphs in German (Deutsch).",
    "fr": "Write both paragraphs in French (français).",
}


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


def _demo_stub_narrative(lang: str, added_n: int, removed_n: int) -> str:
    """Placeholder when AGENTS_STUB_LLM=1 (demo mode, Bedrock intentionally skipped)."""
    if lang == "es":
        return (
            f"[stub-llm] Delta de fragmentos: +{added_n} añadidos / {removed_n} eliminados respecto al snapshot anterior; "
            "configure AGENTS_STUB_LLM=0 y credenciales AWS para un relato Bedrock.\n\n"
            "Valide cualquier conclusión operativa con la vista **Readable diff** y el PDF fuente.\n\n"
            "SCORE: 3"
        )
    if lang == "de":
        return (
            f"[stub-llm] Chunk-Delta: +{added_n} hinzugefügt / {removed_n} entfernt gegenüber dem vorherigen Snapshot; "
            "setzen Sie AGENTS_STUB_LLM=0 und AWS-Credentials für einen Bedrock-Text.\n\n"
            "Prüfen Sie operative Schlussfolgerungen anhand der **Readable diff**-Ansicht und des Quell-PDFs.\n\n"
            "SCORE: 3"
        )
    if lang == "fr":
        return (
            f"[stub-llm] Delta de chunks : +{added_n} ajoutés / {removed_n} supprimés par rapport au snapshot précédent ; "
            "définissez AGENTS_STUB_LLM=0 et les identifiants AWS pour un récit Bedrock.\n\n"
            "Validez toute conclusion opérationnelle via la vue **Readable diff** et le PDF source.\n\n"
            "SCORE: 3"
        )
    return (
        f"[stub-llm] Chunk delta +{added_n} added / {removed_n} removed vs prior snapshot; "
        "set AGENTS_STUB_LLM=0 and AWS credentials for a Bedrock narrative.\n\n"
        "Validate any operational takeaway against the **Readable diff** view and the source PDF.\n\n"
        "SCORE: 3"
    )


def _bedrock_fail_narrative(lang: str, added_n: int, removed_n: int, raw: str) -> str:
    """AGENTS_STUB_LLM=0 but Bedrock call failed — do not ask user to enable stub mode again."""
    hint = bedrock_unavailable_user_message(raw)
    if lang == "es":
        delta = f"Delta de fragmentos: +{added_n} añadidos / {removed_n} eliminados respecto al snapshot anterior."
        follow = "Valide cualquier conclusión operativa con la vista **Readable diff** y el PDF fuente."
    elif lang == "de":
        delta = f"Chunk-Delta: +{added_n} hinzugefügt / {removed_n} entfernt gegenüber dem vorherigen Snapshot."
        follow = "Prüfen Sie operative Schlussfolgerungen anhand der **Readable diff**-Ansicht und des Quell-PDFs."
    elif lang == "fr":
        delta = f"Delta de chunks : +{added_n} ajoutés / {removed_n} supprimés par rapport au snapshot précédent."
        follow = "Validez toute conclusion opérationnelle via la vue **Readable diff** et le PDF source."
    else:
        delta = f"Chunk delta +{added_n} added / {removed_n} removed vs prior snapshot."
        follow = "Validate any operational takeaway against the **Readable diff** view and the source PDF."
    return f"{delta}\n\n{hint}\n\n{follow}\n\nSCORE: 3"


def _split_llm_materiality(cleaned: str) -> tuple[str, str]:
    parts = [p.strip() for p in cleaned.split("\n\n") if p.strip()]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return cleaned.strip(), ""


async def run_summary_agent(req: SummaryAgentRequest) -> SummaryAgentResponse:
    s = req.summary
    lang = req.target_language
    lang_hint = _OUTPUT_LANG_HINT.get(lang, _OUTPUT_LANG_HINT["en"])
    added_n = int(s.get("newChunks") or 0)
    removed_n = int(s.get("removedChunks") or 0)
    if added_n == 0 and removed_n == 0:
        return SummaryAgentResponse(
            llm_summary="No embedding delta in this ingest; document text may still match prior hash.",
            materiality_notes="Chunk set unchanged — open the **Readable diff** view if the PDF hash changed.",
            model_id="none",
            stub=True,
            materiality_score=1,
        )

    added_lines = "\n".join(f"- {_clip(x, 400)}" for x in req.added_preview[:5])
    removed_lines = "\n".join(f"- {_clip(x, 400)}" for x in req.removed_preview[:5])
    user = (
        f"output_language={lang}\n"
        f"{lang_hint}\n\n"
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
        "(likely material for gaming compliance follow-up)."
    )
    system = summary_system_prompt()
    text, mid, stub = converse_text(system, user, max_tokens=700)
    if stub:
        if bedrock_failure_message(text):
            text = _bedrock_fail_narrative(lang, added_n, removed_n, text)
        else:
            text = _demo_stub_narrative(lang, added_n, removed_n)
    cleaned, score = _strip_trailing_score_lines(text)
    llm, mat = _split_llm_materiality(cleaned)
    return SummaryAgentResponse(
        llm_summary=llm,
        materiality_notes=mat,
        model_id=mid,
        stub=stub,
        materiality_score=score,
    )
