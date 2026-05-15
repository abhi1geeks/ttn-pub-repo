"""Short, contextual follow-up prompts for the regulatory chat assistant."""

from __future__ import annotations

import re

from app.schemas import AgenticWorkflowRequest, AgenticWorkflowResponse

# Longest-token wins unless it is a generic "process" word; using it as {label} often
# repeats the user's own framing (e.g. "exceptions ... about exceptions") -- feels cyclic.
_LABEL_AVOID = frozenset(
    {
        "exceptions",
        "requirements",
        "obligations",
        "limitations",
        "limits",
        "definitions",
        "definition",
        "deadlines",
        "deadline",
        "penalties",
        "penalty",
        "enforcement",
        "reporting",
        "filings",
        "filing",
        "compliance",
        "materiality",
        "material",
        "changes",
        "change",
        "comparison",
        "compared",
        "summaries",
        "summary",
        "carve-outs",
        "carveouts",
    }
)

_STOP = frozenset(
    """
    a an the and or but if as at by for from in into of on onto over to with without
    is are was were been being be have has had do does did doing done can could should
    would will shall must may might need want tell please just also only not no yes
    what when where which who whom whose how why this that these those my your our their
    any all each every some such same other another both few more most much many very
    about into than then there here it its we you they them me us him her one two
    give show list help ask use using used using get got getting make made like look
    walk outline describe explain summarize compare diff redline
    """.split()
)


def _focus_topic(query: str) -> str | None:
    """Pick a short topical anchor from the user query (lowercase word or hyphenated token)."""
    raw = query.strip()
    if not raw:
        return None
    # Quoted phrase wins
    m = re.search(r'"([^"]{2,80})"', raw)
    if m:
        t = m.group(1).strip().lower()
        return t[:48] if t else None
    m = re.search(r"'([^']{2,80})'", raw)
    if m:
        t = m.group(1).strip().lower()
        return t[:48] if t else None

    tokens = re.findall(r"[A-Za-z][A-Za-z0-9_-]{2,}", raw)
    scored: list[tuple[int, str]] = []
    for t in tokens:
        w = t.lower()
        if w in _STOP or len(w) < 4:
            continue
        scored.append((len(w), w))
    if not scored:
        return None
    scored.sort(reverse=True)
    for _ln, w in scored:
        if w not in _LABEL_AVOID:
            return w[:48]
    return scored[0][1][:48]


def _dedupe_preserve(candidates: list[str], *, max_n: int) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for c in candidates:
        s = " ".join(c.split())
        if len(s) < 8 or s in seen:
            continue
        seen.add(s)
        out.append(s)
        if len(out) >= max_n:
            break
    return out


def build_suggested_followups(body: AgenticWorkflowRequest, resp: AgenticWorkflowResponse) -> list[str]:
    """Return 2–3 concise follow-up questions tailored to the last user query and response shape."""
    q = body.query.strip()
    ql = q.lower()
    focus = _focus_topic(q)
    label = focus if focus else "this topic"
    route = (resp.supervisor_route or "").lower()
    needs = list(resp.needs_input or [])

    out: list[str] = []

    if resp.blocked and resp.intent == "blocked":
        out.extend(
            [
                "Rephrase as a factual question about wording in the indexed document (no instructions to bypass safeguards).",
                "Ask what a specific section or defined term says, so the answer can cite retrieved chunks.",
            ]
        )
        return _dedupe_preserve(out, max_n=3)

    if needs:
        if any("document_url" in n for n in needs):
            out.append("After you select a scoped document run, what is the first obligation or definition you want checked against the text?")
        if any("indexed_chunks" in n or "qdrant" in n for n in needs):
            out.append(f"Once this run is indexed, ask again about {label} so answers can cite [chunk:N] excerpts.")
        if any("compare_context" in n for n in needs):
            out.append(
                "When baseline and current full text are attached, ask which sections changed and what that implies for compliance."
            )
        if any("summary_context" in n for n in needs):
            out.append("After ingest summary context is attached, ask which deltas are material for your process or stakeholders.")
        if not out:
            out.append("What single missing input can you provide next so we can retry with the same question?")
        return _dedupe_preserve(out, max_n=3)

    if resp.executed and resp.qna and resp.qna.answer:
        if route == "conversational":
            out.extend(
                [
                    "What obligation or deadline in the indexed document applies to my situation?",
                    "Which section or keyword should we look up first, with citations to supporting chunks?",
                    "What definitions in the document govern how a key term is applied?",
                ]
            )
            return _dedupe_preserve(out, max_n=3)

        cited = list(resp.qna.cited_chunk_indices or [])
        if cited:
            out.append(f"What exceptions, carve-outs, or limits apply to {label} in the cited text?")
            out.append(f"Does the document tie {label} to deadlines, fees, reporting, or enforcement?")
            out.append(f"What do the other retrieved chunks add about {label} beyond the cited excerpts?")
        else:
            out.append(f"Which chunk in the index best supports the main claim about {label}?")
            out.append(f"What nuance or condition in the text qualifies the answer on {label}?")

    elif resp.executed and resp.comparison:
        out.append("Which obligations clearly tightened, relaxed, or were added between baseline and current?")
        out.append("Are there new filing, testing, or reporting requirements implied by the wording changes?")
        if focus:
            out.append(f'Call out any wording changes for "{focus}" between the two versions.')

    elif resp.executed and resp.summary:
        out.append("Which of these ingest deltas are highest impact for day-to-day compliance?")
        out.append("What should we double-check in the next review cycle given this summary?")
        if focus:
            out.append(f"Zoom in on summary items that relate to {label}.")

    elif resp.executed:
        out.append(f"Ask a narrower question about {label} so the workflow can ground an answer in chunks.")

    if "deadline" in ql or "due date" in ql or "timeline" in ql:
        out.append("Does the text mention extensions, waivers, or grace periods for that timeline?")
    if any(k in ql for k in ("penalt", "fine", "sanction", "enforce")):
        out.append("What factors or thresholds does the document link to penalties or enforcement?")
    if "definition" in ql or "define" in ql or "meaning" in ql:
        out.append("Where else is that term used, and do other sections refine its meaning?")

    if not out:
        out.append(f"What should we clarify next about {label}?")

    return _dedupe_preserve(out, max_n=3)
