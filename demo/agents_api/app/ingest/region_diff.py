"""Map page-level text diffs to PDF bounding-box regions."""

from __future__ import annotations

import difflib
from typing import Any, Literal

ChangeKind = Literal["insert", "delete", "replace"]


def _union_bbox(boxes: list[list[float]]) -> list[float] | None:
    if not boxes:
        return None
    x0 = min(b[0] for b in boxes)
    y0 = min(b[1] for b in boxes)
    x1 = max(b[2] for b in boxes)
    y1 = max(b[3] for b in boxes)
    return [x0, y0, x1, y1]


def _spans_for_range(spans: list[dict[str, Any]], start: int, end: int) -> list[list[float]]:
    out: list[list[float]] = []
    for s in spans:
        t = str(s.get("text") or "")
        cs = int(s.get("charStart") or 0)
        ce = cs + len(t)
        if ce <= start or cs >= end:
            continue
        bbox = s.get("bbox")
        if isinstance(bbox, list) and len(bbox) >= 4:
            out.append([float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])])
    return out


def _append_span_regions(
    regions: list[dict[str, Any]],
    *,
    boxes: list[list[float]],
    page: int,
    kind: ChangeKind,
    excerpt: str,
) -> None:
    """One tight highlight per text span (avoids page-wide union boxes)."""
    for box in boxes:
        regions.append(
            {
                "page": page,
                "kind": kind,
                "bbox": box,
                "excerpt": excerpt[:200] if excerpt else "",
            }
        )


def _regions_from_text_diff(
    old_text: str,
    new_text: str,
    old_spans: list[dict[str, Any]],
    new_spans: list[dict[str, Any]],
    page: int,
) -> list[dict[str, Any]]:
    regions: list[dict[str, Any]] = []
    sm = difflib.SequenceMatcher(None, old_text, new_text)
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        excerpt = (new_text[j1:j2] or old_text[i1:i2] or "").strip()[:200]
        if tag == "replace":
            old_boxes = _spans_for_range(old_spans, i1, i2)
            new_boxes = _spans_for_range(new_spans, j1, j2)
            _append_span_regions(regions, boxes=old_boxes, page=page, kind="delete", excerpt=excerpt)
            _append_span_regions(regions, boxes=new_boxes, page=page, kind="insert", excerpt=excerpt)
            continue
        kind: ChangeKind = "delete" if tag == "delete" else "insert"
        boxes: list[list[float]] = []
        if tag == "delete":
            boxes = _spans_for_range(old_spans, i1, i2)
        else:
            boxes = _spans_for_range(new_spans, j1, j2)
        _append_span_regions(regions, boxes=boxes, page=page, kind=kind, excerpt=excerpt)
    return regions


def compute_change_regions(
    baseline_layout: dict[str, Any],
    current_layout: dict[str, Any],
) -> list[dict[str, Any]]:
    base_pages = {int(p["pageNumber"]): p for p in baseline_layout.get("pages") or []}
    cur_pages = {int(p["pageNumber"]): p for p in current_layout.get("pages") or []}
    all_nums = sorted(set(base_pages.keys()) | set(cur_pages.keys()))
    regions: list[dict[str, Any]] = []
    for pn in all_nums:
        bp = base_pages.get(pn)
        cp = cur_pages.get(pn)
        if bp and cp:
            regions.extend(
                _regions_from_text_diff(
                    str(bp.get("text") or ""),
                    str(cp.get("text") or ""),
                    list(bp.get("spans") or []),
                    list(cp.get("spans") or []),
                    pn,
                )
            )
        elif bp and not cp:
            spans = list(bp.get("spans") or [])
            boxes = [s["bbox"] for s in spans if isinstance(s.get("bbox"), list)]
            _append_span_regions(
                regions,
                boxes=boxes,  # type: ignore[arg-type]
                page=pn,
                kind="delete",
                excerpt="",
            )
        elif cp and not bp:
            spans = list(cp.get("spans") or [])
            boxes = [s["bbox"] for s in spans if isinstance(s.get("bbox"), list)]
            _append_span_regions(
                regions,
                boxes=boxes,  # type: ignore[arg-type]
                page=pn,
                kind="insert",
                excerpt="",
            )
    return regions


def find_previous_layout_path(url_hash: str, current_version_id: str) -> str | None:
    from pathlib import Path

    from app.ingest.layout import artifacts_root

    layout_dir = artifacts_root() / "layout" / url_hash
    if not layout_dir.is_dir():
        return None
    versions = sorted(p.stem for p in layout_dir.glob("*.json"))
    prior = [v for v in versions if v < current_version_id]
    if not prior:
        return None
    prev = prior[-1]
    return f"layout/{url_hash}/{prev}.json"
