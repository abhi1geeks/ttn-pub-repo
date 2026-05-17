"""Tests for page-level region diff."""

from agents_api.app.ingest.region_diff import compute_change_regions


def test_compute_change_regions_detects_text_change():
    baseline = {
        "pages": [
            {
                "pageNumber": 1,
                "width": 612,
                "height": 792,
                "text": "Hello world",
                "spans": [
                    {"text": "Hello ", "bbox": [72, 700, 120, 720], "charStart": 0},
                    {"text": "world", "bbox": [120, 700, 180, 720], "charStart": 6},
                ],
            }
        ]
    }
    current = {
        "pages": [
            {
                "pageNumber": 1,
                "width": 612,
                "height": 792,
                "text": "Hello earth",
                "spans": [
                    {"text": "Hello ", "bbox": [72, 700, 120, 720], "charStart": 0},
                    {"text": "earth", "bbox": [120, 700, 180, 720], "charStart": 6},
                ],
            }
        ]
    }
    regions = compute_change_regions(baseline, current)
    assert len(regions) >= 1
    assert regions[0]["page"] == 1
    assert regions[0]["kind"] in ("delete", "insert")
    assert len(regions[0]["bbox"]) == 4
    # Tight per-span box, not a page-wide union
    assert regions[0]["bbox"][2] - regions[0]["bbox"][0] < 200
