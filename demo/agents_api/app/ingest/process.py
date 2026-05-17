"""Orchestrate layout extraction and region diff for one ingest run."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from app.ingest.layout import artifacts_root, extract_layout_from_pdf, write_layout_json
from app.ingest.layout import read_layout_json
from app.ingest.block_align import compute_aligned_changes, summarize_aligned_changes
from app.ingest.region_diff import compute_change_regions, find_previous_layout_path


def _read_layout_for_version(url_hash: str, version_id: str) -> dict[str, Any] | None:
    """Load layout JSON; tolerate versionId with colons vs dashed PDF basename."""
    for vid in (version_id, version_id.replace(":", "-")):
        layout = read_layout_json(f"layout/{url_hash}/{vid}.json")
        if layout:
            return layout
    return None


def diff_regions_for_versions(
    *,
    document_url: str,
    baseline_version_id: str,
    current_version_id: str,
    url_hash: str | None = None,
) -> dict[str, Any]:
    if not url_hash:
        import hashlib

        url_hash = hashlib.sha256(document_url.encode()).hexdigest()[:16]
    baseline_layout = _read_layout_for_version(url_hash, baseline_version_id)
    current_layout = _read_layout_for_version(url_hash, current_version_id)
    if not baseline_layout:
        raise FileNotFoundError(
            f"Baseline layout not found for version {baseline_version_id!r} under layout/{url_hash}/"
        )
    if not current_layout:
        raise FileNotFoundError(
            f"Current layout not found for version {current_version_id!r} under layout/{url_hash}/"
        )
    regions = compute_change_regions(baseline_layout, current_layout)
    aligned = compute_aligned_changes(baseline_layout, current_layout)
    return {
        "changeRegions": regions,
        "alignedChanges": aligned,
        "summary": summarize_aligned_changes(aligned),
        "baselineVersionId": baseline_version_id,
        "currentVersionId": current_version_id,
    }


def aligned_changes_for_versions(
    *,
    document_url: str,
    baseline_version_id: str,
    current_version_id: str,
    url_hash: str | None = None,
) -> dict[str, Any]:
    if not url_hash:
        import hashlib

        url_hash = hashlib.sha256(document_url.encode()).hexdigest()[:16]
    baseline_layout = _read_layout_for_version(url_hash, baseline_version_id)
    current_layout = _read_layout_for_version(url_hash, current_version_id)
    if not baseline_layout:
        raise FileNotFoundError(
            f"Baseline layout not found for version {baseline_version_id!r} under layout/{url_hash}/"
        )
    if not current_layout:
        raise FileNotFoundError(
            f"Current layout not found for version {current_version_id!r} under layout/{url_hash}/"
        )
    aligned = compute_aligned_changes(baseline_layout, current_layout)
    return {
        "alignedChanges": aligned,
        "summary": summarize_aligned_changes(aligned),
        "baselineVersionId": baseline_version_id,
        "currentVersionId": current_version_id,
    }


def process_ingest_artifacts(
    *,
    document_url: str,
    version_id: str,
    pdf_rel_path: str,
    url_hash: str | None = None,
) -> dict[str, Any]:
    root = artifacts_root()
    pdf_abs = (root / pdf_rel_path).resolve()
    if not str(pdf_abs).startswith(str(root.resolve())):
        raise ValueError(f"pdf_path escapes ARTIFACTS_ROOT: {pdf_rel_path}")
    if not pdf_abs.is_file():
        parent = pdf_abs.parent
        hint = ""
        if parent.is_dir():
            hint = f" (found: {[p.name for p in sorted(parent.iterdir())[:12]]})"
        raise FileNotFoundError(
            f"PDF not found on agents volume: {pdf_abs}{hint}. "
            "Confirm n8n and agents both mount regulatory_artifacts at /data/regulatory."
        )

    if not url_hash:
        import hashlib

        url_hash = hashlib.sha256(document_url.encode()).hexdigest()[:16]

    layout = extract_layout_from_pdf(str(pdf_abs))
    layout_rel = f"layout/{url_hash}/{version_id}.json"
    write_layout_json(layout_rel, layout)

    layout_artifact = {"path": layout_rel, "pageCount": layout.get("pageCount", 0)}

    change_regions: list[dict[str, Any]] = []
    baseline_version_id: str | None = None
    baseline_layout: dict[str, Any] | None = None
    prev_layout_rel = find_previous_layout_path(url_hash, version_id)
    if prev_layout_rel:
        baseline_layout = read_layout_json(prev_layout_rel)
        if baseline_layout:
            baseline_version_id = Path(prev_layout_rel).stem
            change_regions = compute_change_regions(baseline_layout, layout)

    aligned_changes: list[dict[str, Any]] = []
    aligned_rel: str | None = None
    diff_rel: str | None = None
    if baseline_version_id and baseline_layout:
        aligned_changes = compute_aligned_changes(baseline_layout, layout)
        aligned_rel = f"aligned/{url_hash}/{baseline_version_id}__{version_id}.json"
        aligned_abs = root / aligned_rel
        aligned_abs.parent.mkdir(parents=True, exist_ok=True)
        aligned_abs.write_text(
            __import__("json").dumps(
                {
                    "baselineVersionId": baseline_version_id,
                    "currentVersionId": version_id,
                    "changes": aligned_changes,
                    "summary": summarize_aligned_changes(aligned_changes),
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        if change_regions:
            diff_rel = f"diff/{url_hash}/{baseline_version_id}__{version_id}.json"
            diff_abs = root / diff_rel
            diff_abs.parent.mkdir(parents=True, exist_ok=True)
            diff_abs.write_text(
                __import__("json").dumps(
                    {
                        "baselineVersionId": baseline_version_id,
                        "currentVersionId": version_id,
                        "regions": change_regions,
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

    return {
        "layoutArtifact": layout_artifact,
        "changeRegions": change_regions,
        "alignedChanges": aligned_changes,
        "alignedSummary": summarize_aligned_changes(aligned_changes),
        "baselineVersionId": baseline_version_id,
        "diffArtifact": {"path": diff_rel} if diff_rel else None,
        "alignedArtifact": {"path": aligned_rel} if aligned_rel else None,
    }
