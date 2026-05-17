"""Tests for on-demand diff between two layout versions."""

from agents_api.app.ingest.process import diff_regions_for_versions


def test_diff_regions_for_versions_finds_changes():
    baseline = {
        "pages": [
            {
                "pageNumber": 1,
                "width": 612,
                "height": 792,
                "text": "Alpha",
                "spans": [{"text": "Alpha", "bbox": [72, 100, 140, 120], "charStart": 0}],
            }
        ]
    }
    current = {
        "pages": [
            {
                "pageNumber": 1,
                "width": 612,
                "height": 792,
                "text": "Beta",
                "spans": [{"text": "Beta", "bbox": [72, 100, 130, 120], "charStart": 0}],
            }
        ]
    }

    from agents_api.app.ingest import layout as layout_mod

    root = layout_mod.artifacts_root()
    url_hash = "testhash12345678"
    base_dir = root / "layout" / url_hash
    base_dir.mkdir(parents=True, exist_ok=True)
    (base_dir / "v1.json").write_text(__import__("json").dumps(baseline), encoding="utf-8")
    (base_dir / "v2.json").write_text(__import__("json").dumps(current), encoding="utf-8")

    out = diff_regions_for_versions(
        document_url="https://example.com/doc.pdf",
        baseline_version_id="v1",
        current_version_id="v2",
        url_hash=url_hash,
    )
    assert len(out["changeRegions"]) >= 1
