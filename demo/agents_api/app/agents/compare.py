"""UC1-004 narrative compare (short executive redline story)."""

from __future__ import annotations

import difflib
from typing import Any

from app.agents.agent_definitions import compare_system_prompt
from app.bedrock import converse_text
from app.schemas import CompareAgentRequest, CompareAgentResponse, CompareChunkDelta


def _clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 3] + "..."


def _head_tail_sample(s: str, max_chars: int) -> str:
    """Prefer head + tail so late sections (common in regs) are not invisible to the model."""
    s = s.strip()
    if len(s) <= max_chars:
        return s
    head = max(2000, (max_chars * 55) // 100)
    tail = max(2000, max_chars - head - 40)
    marker = "\n\n[... middle of document omitted for length ...]\n\n"
    if head + len(marker) + tail > max_chars:
        tail = max_chars - head - len(marker)
    if tail < 800:
        return s[:max_chars]
    return s[:head] + marker + s[-tail:]


def _unified_diff_excerpt(
    old: str,
    new: str,
    *,
    max_lines: int = 12_000,
    max_chars: int = 16_000,
) -> str:
    """
    Line-level unified diff (same family as Readable diff). Catches edits in the document middle
    that head+tail sampling would miss. Output is capped for LLM context.
    """
    old_lines = old.splitlines()
    new_lines = new.splitlines()
    truncated = False
    if len(old_lines) > max_lines or len(new_lines) > max_lines:
        truncated = True
        old_lines = old_lines[:max_lines]
        new_lines = new_lines[:max_lines]
    out: list[str] = []
    n = 0
    for line in difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile="baseline",
        tofile="current",
        lineterm="",
        n=2,
    ):
        if n + len(line) + 1 > max_chars:
            out.append("... [unified diff truncated; more edits may exist beyond this window] ...")
            break
        out.append(line)
        n += len(line) + 1
    body = "\n".join(out).strip()
    if not body:
        return "(no line differences in diff scope — bodies may be identical in compared lines)"
    prefix = (
        f"[Line diff covers first {max_lines} lines of each body.]\n"
        if truncated
        else "[Line diff covers full bodies in this scope.]\n"
    )
    return prefix + body


def _format_ingest_chunk_deltas(changes: list[CompareChunkDelta]) -> str:
    """Excerpts from chunks the indexer flagged as added/removed for this ingest (aligns with Embedding delta tab)."""
    if not changes:
        return ""
    lines: list[str] = [
        "=== 0) Ingest-highlighted chunks (hash/embedding delta for the current run) ===",
        "These are not the full documents; they show where the pipeline detected new vs dropped chunk text. "
        "Use with the unified line diff below; cite chunk indices when you refer to them.\n",
    ]
    for c in changes[:48]:
        idx = c.chunk_index if c.chunk_index is not None else "?"
        lines.append(f"\n--- {c.kind.upper()} chunk_index={idx} ---\n{_clip(c.excerpt, 2000)}")
    return "\n".join(lines)


def _split_pages(text: str) -> list[str]:
    """Split on form-feed (PDF text layers); matches web `splitIntoPages`."""
    t = text.replace("\r\n", "\n").replace("\r", "\n")
    if "\f" not in t:
        return [t] if t else [""]
    parts = [p for p in t.split("\f") if p != ""]
    return parts if parts else [t]


def _page_indexed_change_list(
    old: str,
    new: str,
    *,
    max_pages: int = 250,
    max_hunks: int = 120,
    max_lines_per_page: int = 8000,
) -> str:
    """
    Deterministic per-logical-page line opcodes (1-based page = split on \\f, else single page).
    """
    old_pages = _split_pages(old.strip())
    new_pages = _split_pages(new.strip())
    n_pages = max(len(old_pages), len(new_pages))
    if n_pages == 0:
        return ""
    bullets: list[str] = []
    for pi in range(min(n_pages, max_pages)):
        o = old_pages[pi] if pi < len(old_pages) else ""
        n = new_pages[pi] if pi < len(new_pages) else ""
        o_lines = o.splitlines()
        n_lines = n.splitlines()
        if len(o_lines) > max_lines_per_page:
            o_lines = o_lines[:max_lines_per_page]
        if len(n_lines) > max_lines_per_page:
            n_lines = n_lines[:max_lines_per_page]
        sm = difflib.SequenceMatcher(a=o_lines, b=n_lines)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag == "equal":
                continue
            br = f"{i1 + 1}-{i2}" if i2 > i1 else "—"
            cr = f"{j1 + 1}-{j2}" if j2 > j1 else "—"
            snippet_o = " ".join(x.strip() for x in o_lines[i1:i2])[:220]
            snippet_n = " ".join(x.strip() for x in n_lines[j1:j2])[:220]
            bullets.append(
                f"- **Logical page {pi + 1}** — {tag}: baseline lines {br}; current lines {cr}\n"
                f"  - baseline: {_clip(snippet_o, 200)}\n"
                f"  - current:  {_clip(snippet_n, 200)}"
            )
            if len(bullets) >= max_hunks:
                return (
                    f"[Truncated after {max_hunks} hunks; increase limits or use Readable diff for full view.]\n"
                    + "\n".join(bullets)
                )
    return "\n".join(bullets) if bullets else ""


async def run_compare_agent(req: CompareAgentRequest) -> CompareAgentResponse:
    raw_a = req.baseline_text.strip()
    raw_b = req.current_text.strip()
    uq = (req.user_question or "").strip()
    diff_excerpt = _unified_diff_excerpt(raw_a, raw_b)
    page_hunks = _page_indexed_change_list(raw_a, raw_b, max_hunks=120)
    a = _head_tail_sample(raw_a, req.max_chars)
    b = _head_tail_sample(raw_b, req.max_chars)
    sm = difflib.SequenceMatcher(a=a, b=b)
    ratio = sm.ratio()
    excerpt_cap = min(5000, max(2500, req.max_chars // 3))
    chunk_block = _format_ingest_chunk_deltas(req.chunk_changes)
    lead = f"{chunk_block}\n\n" if chunk_block else ""
    page_block = ""
    if page_hunks:
        page_block = (
            "=== 1b) Page-indexed line change hunks (logical page = split on form-feed \\f between PDF pages; "
            "if there is no \\f, everything is **logical page 1**) ===\n"
            f"{page_hunks}\n\n"
        )
    list_instructions = (
        "\nIf the user's question clearly asks for a **full list**, **every change**, **exhaustive enumeration**, "
        "or **page-level listing** of edits, add (after the headline and short narrative) a section "
        "**### Change list (by logical page)** and reproduce the bullets from section 1b above "
        "(you may merge adjacent trivial join/split lines on the same page into one bullet). "
        "If section 1b is empty, explain that no line-level hunks were detected in scope (or only whitespace), "
        "and point them to the Readable diff UI. If they did **not** ask for enumeration, **omit** that section and "
        "keep the narrative compact.\n"
    )
    user = (
        f"{lead}"
        f"{page_block}"
        "=== 1) Deterministic unified line diff (global; line numbers are not PDF page numbers) ===\n"
        f"{diff_excerpt}\n\n"
        f"=== 2) Character similarity on head+tail sample only (up to {req.max_chars} chars each): {ratio:.4f} ===\n"
        "(Head+tail can miss mid-document edits; prefer sections 1b and 1 when they disagree.)\n\n"
        "Baseline excerpt (head + tail):\n"
        f"{_clip(a, excerpt_cap)}\n\n"
        "Current excerpt (head + tail):\n"
        f"{_clip(b, excerpt_cap)}\n\n"
        f"User question (honor this): {uq or '(not provided)'}\n\n"
        "Write (1) a one-line headline, (2) 2-4 sentences of narrative for executives about what changed, "
        "without legal advice. If section 1 shows +/- lines, you must reflect those edits."
        f"{list_instructions}"
    )
    system = compare_system_prompt()
    max_out = 1600 if page_hunks else 550
    text, mid, stub = converse_text(system, user, max_tokens=max_out)
    headline, _, rest = text.partition("\n")
    narrative = (rest or text).strip()
    debug_meta: dict[str, Any] | None = None
    if req.debug:
        debug_meta = {
            "user_question_chars": len(uq),
            "page_list_section_left_to_model": True,
            "baseline_body_chars": len(raw_a),
            "current_body_chars": len(raw_b),
            "logical_baseline_pages": len(_split_pages(raw_a)),
            "logical_current_pages": len(_split_pages(raw_b)),
            "has_form_feed_in_either_body": ("\f" in raw_a) or ("\f" in raw_b),
            "unified_diff_excerpt_chars": len(diff_excerpt),
            "page_hunks_block_chars": len(page_hunks) if page_hunks else 0,
            "chunk_changes_count": len(req.chunk_changes),
            "chunk_block_chars": len(chunk_block),
            "head_tail_similarity_ratio": round(ratio, 4),
            "compare_llm_user_prompt_chars": len(user),
            "compare_llm_max_tokens": max_out,
            "note": (
                "Compare agent returns headline+narrative prose, not a rendered side-by-side grid. "
                "True two-column diff is the Readable diff tab. "
                "Logical page numbers require form-feed (\\f) page breaks in extracted text."
            ),
        }
    return CompareAgentResponse(
        headline=headline.strip() or text[:120],
        narrative=narrative,
        model_id=mid,
        stub=stub,
        debug_meta=debug_meta,
    )
