"""Group layout spans into blocks and align baseline vs current (cross-page moves)."""

from __future__ import annotations

import difflib
import re
from typing import Any, Literal

ChangeKind = Literal["inserted", "deleted", "modified", "moved"]

# Vertical gap (PDF pts) between span lines to start a new block.
PARAGRAPH_GAP_PT = 18.0
LINE_Y_TOLERANCE_PT = 6.0
# Min text similarity to pair blocks across versions.
MATCH_SIMILARITY = 0.52
# At or above this, treated as unchanged (omitted from change list).
UNCHANGED_SIMILARITY = 0.97


def _normalize_text(s: str) -> str:
    t = re.sub(r"\s+", " ", (s or "").strip().lower())
    return t


def _text_similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, _normalize_text(a), _normalize_text(b)).ratio()


def _union_bbox(boxes: list[list[float]]) -> list[float]:
    if not boxes:
        return [0.0, 0.0, 0.0, 0.0]
    return [
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    ]


def _finalize_block(page: int, span_group: list[dict[str, Any]], index: int) -> dict[str, Any]:
    texts = [str(s.get("text") or "") for s in span_group]
    boxes = [s["bbox"] for s in span_group if isinstance(s.get("bbox"), list) and len(s["bbox"]) >= 4]
    text = " ".join(t for t in texts if t).strip()
    return {
        "blockId": f"p{page}-b{index}",
        "page": page,
        "text": text,
        "bbox": _union_bbox(boxes),
        "spanCount": len(span_group),
    }


def blocks_from_layout(layout: dict[str, Any]) -> list[dict[str, Any]]:
    """Cluster spans per page into paragraph-ish blocks (top-left PDF coords)."""
    out: list[dict[str, Any]] = []
    for page in layout.get("pages") or []:
        pn = int(page.get("pageNumber") or 0)
        spans = list(page.get("spans") or [])
        if not spans:
            continue
        ordered = sorted(
            spans,
            key=lambda s: (
                float((s.get("bbox") or [0, 0, 0, 0])[1]),
                float((s.get("bbox") or [0, 0, 0, 0])[0]),
            ),
        )
        group: list[dict[str, Any]] = []
        prev_bottom: float | None = None
        block_idx = 0
        for s in ordered:
            bbox = s.get("bbox")
            if not isinstance(bbox, list) or len(bbox) < 4:
                continue
            y0, y1 = float(bbox[1]), float(bbox[3])
            if group and prev_bottom is not None:
                gap = y0 - prev_bottom
                if gap > PARAGRAPH_GAP_PT:
                    out.append(_finalize_block(pn, group, block_idx))
                    block_idx += 1
                    group = []
            group.append(s)
            prev_bottom = y1
        if group:
            out.append(_finalize_block(pn, group, block_idx))
    return out


def _match_blocks(
    baseline_blocks: list[dict[str, Any]],
    current_blocks: list[dict[str, Any]],
) -> list[tuple[int, int, float]]:
    """Greedy best match: each baseline block -> at most one current block."""
    pairs: list[tuple[int, int, float]] = []
    used_current: set[int] = set()
    candidates: list[tuple[float, int, int]] = []
    for bi, b in enumerate(baseline_blocks):
        for ci, c in enumerate(current_blocks):
            sim = _text_similarity(str(b.get("text") or ""), str(c.get("text") or ""))
            if sim >= MATCH_SIMILARITY:
                candidates.append((sim, bi, ci))
    candidates.sort(reverse=True, key=lambda x: x[0])
    used_baseline: set[int] = set()
    for sim, bi, ci in candidates:
        if bi in used_baseline or ci in used_current:
            continue
        used_baseline.add(bi)
        used_current.add(ci)
        pairs.append((bi, ci, sim))
    return pairs


def compute_aligned_changes(
    baseline_layout: dict[str, Any],
    current_layout: dict[str, Any],
) -> list[dict[str, Any]]:
    baseline_blocks = blocks_from_layout(baseline_layout)
    current_blocks = blocks_from_layout(current_layout)
    pairs = _match_blocks(baseline_blocks, current_blocks)
    matched_b = {p[0] for p in pairs}
    matched_c = {p[1] for p in pairs}
    changes: list[dict[str, Any]] = []

    for bi, ci, sim in pairs:
        b = baseline_blocks[bi]
        c = current_blocks[ci]
        if sim >= UNCHANGED_SIMILARITY:
            continue
        b_page = int(b["page"])
        c_page = int(c["page"])
        kind: ChangeKind = "moved" if b_page != c_page else "modified"
        changes.append(
            {
                "kind": kind,
                "similarity": round(sim, 4),
                "baselinePage": b_page,
                "currentPage": c_page,
                "baselineBlockId": b["blockId"],
                "currentBlockId": c["blockId"],
                "baselineBbox": b["bbox"],
                "currentBbox": c["bbox"],
                "baselineExcerpt": str(b.get("text") or "")[:300],
                "currentExcerpt": str(c.get("text") or "")[:300],
            }
        )

    for bi, b in enumerate(baseline_blocks):
        if bi in matched_b:
            continue
        changes.append(
            {
                "kind": "deleted",
                "similarity": 0.0,
                "baselinePage": int(b["page"]),
                "currentPage": None,
                "baselineBlockId": b["blockId"],
                "currentBlockId": None,
                "baselineBbox": b["bbox"],
                "currentBbox": None,
                "baselineExcerpt": str(b.get("text") or "")[:300],
                "currentExcerpt": "",
            }
        )

    for ci, c in enumerate(current_blocks):
        if ci in matched_c:
            continue
        changes.append(
            {
                "kind": "inserted",
                "similarity": 0.0,
                "baselinePage": None,
                "currentPage": int(c["page"]),
                "baselineBlockId": None,
                "currentBlockId": c["blockId"],
                "baselineBbox": None,
                "currentBbox": c["bbox"],
                "baselineExcerpt": "",
                "currentExcerpt": str(c.get("text") or "")[:300],
            }
        )

    def sort_key(ch: dict[str, Any]) -> tuple[int, int, str]:
        page = ch.get("currentPage") or ch.get("baselinePage") or 0
        return (int(page), 0 if ch["kind"] == "deleted" else 1, ch.get("kind", ""))

    changes.sort(key=sort_key)
    return changes


def summarize_aligned_changes(changes: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"inserted": 0, "deleted": 0, "modified": 0, "moved": 0}
    for ch in changes:
        k = ch.get("kind")
        if k in counts:
            counts[k] += 1
    return counts
