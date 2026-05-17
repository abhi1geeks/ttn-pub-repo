"""Tests for layout block alignment."""

from agents_api.app.ingest.block_align import (
    blocks_from_layout,
    compute_aligned_changes,
    summarize_aligned_changes,
)


def _layout(pages: list[dict]) -> dict:
    return {"pages": pages, "pageCount": len(pages)}


def test_detects_moved_block_across_pages():
    baseline = _layout(
        [
            {
                "pageNumber": 1,
                "width": 612,
                "height": 792,
                "text": "Alpha section text here.",
                "spans": [
                    {
                        "text": "Alpha section text here.",
                        "bbox": [72, 100, 400, 120],
                        "charStart": 0,
                    }
                ],
            }
        ]
    )
    current = _layout(
        [
            {"pageNumber": 1, "width": 612, "height": 792, "text": "", "spans": []},
            {
                "pageNumber": 2,
                "width": 612,
                "height": 792,
                "text": "Alpha section text with edit.",
                "spans": [
                    {
                        "text": "Alpha section text with edit.",
                        "bbox": [72, 200, 420, 220],
                        "charStart": 0,
                    }
                ],
            },
        ]
    )
    changes = compute_aligned_changes(baseline, current)
    kinds = {c["kind"] for c in changes}
    assert "moved" in kinds or "modified" in kinds
    moved = [c for c in changes if c["kind"] == "moved"]
    if moved:
        assert moved[0]["baselinePage"] == 1
        assert moved[0]["currentPage"] == 2


def test_detects_inserted_and_deleted_blocks():
    baseline = _layout(
        [
            {
                "pageNumber": 1,
                "width": 612,
                "height": 792,
                "text": "Only in baseline document.",
                "spans": [
                    {
                        "text": "Only in baseline document.",
                        "bbox": [72, 100, 300, 120],
                        "charStart": 0,
                    }
                ],
            }
        ]
    )
    current = _layout(
        [
            {
                "pageNumber": 1,
                "width": 612,
                "height": 792,
                "text": "Only in current document.",
                "spans": [
                    {
                        "text": "Only in current document.",
                        "bbox": [72, 100, 300, 120],
                        "charStart": 0,
                    }
                ],
            }
        ]
    )
    changes = compute_aligned_changes(baseline, current)
    kinds = {c["kind"] for c in changes}
    assert "deleted" in kinds
    assert "inserted" in kinds
    summary = summarize_aligned_changes(changes)
    assert summary["deleted"] >= 1
    assert summary["inserted"] >= 1


def test_blocks_from_layout_groups_spans():
    layout = _layout(
        [
            {
                "pageNumber": 1,
                "width": 612,
                "height": 792,
                "text": "Line one. Line two.",
                "spans": [
                    {"text": "Line one.", "bbox": [72, 100, 150, 115], "charStart": 0},
                    {"text": "Line two.", "bbox": [72, 200, 150, 215], "charStart": 9},
                ],
            }
        ]
    )
    blocks = blocks_from_layout(layout)
    assert len(blocks) >= 2
