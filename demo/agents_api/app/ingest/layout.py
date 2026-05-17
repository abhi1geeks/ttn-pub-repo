"""Extract per-page text spans with PDF bounding boxes (PyMuPDF)."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

try:
    import fitz  # PyMuPDF
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore


def artifacts_root() -> Path:
    return Path(os.environ.get("ARTIFACTS_ROOT", "/data/regulatory"))


def extract_layout_from_pdf(abs_pdf_path: str) -> dict[str, Any]:
    if fitz is None:
        raise RuntimeError("PyMuPDF (pymupdf) is not installed")
    pdf_path = Path(abs_pdf_path)
    if not pdf_path.is_file():
        parent = pdf_path.parent
        hint = ""
        if parent.is_dir():
            names = sorted(p.name for p in parent.iterdir())[:12]
            hint = f"; directory contains: {names!r}"
        raise FileNotFoundError(f"PDF not found: {pdf_path}{hint}")
    data = pdf_path.read_bytes()
    if len(data) < 5 or not data.startswith(b"%PDF-"):
        raise ValueError(
            f"Not a valid PDF at {pdf_path} ({len(data)} bytes). "
            "Ensure n8n and agents share the regulatory_artifacts volume."
        )
    # Open from bytes so ISO timestamps with ':' in the path cannot confuse MuPDF.
    doc = fitz.open(stream=data, filetype="pdf")
    pages: list[dict[str, Any]] = []
    try:
        for i in range(doc.page_count):
            page = doc.load_page(i)
            rect = page.rect
            page_text_parts: list[str] = []
            spans_out: list[dict[str, Any]] = []
            char_cursor = 0
            blocks = page.get_text("dict").get("blocks") or []
            for block in blocks:
                if block.get("type") != 0:
                    continue
                for line in block.get("lines") or []:
                    for span in line.get("spans") or []:
                        text = str(span.get("text") or "")
                        if not text:
                            continue
                        bbox = span.get("bbox") or line.get("bbox") or block.get("bbox")
                        if not bbox or len(bbox) < 4:
                            continue
                        x0, y0, x1, y1 = [float(bbox[0]), float(bbox[1]), float(bbox[2]), float(bbox[3])]
                        spans_out.append(
                            {
                                "text": text,
                                "bbox": [x0, y0, x1, y1],
                                "charStart": char_cursor,
                            }
                        )
                        page_text_parts.append(text)
                        char_cursor += len(text)
            pages.append(
                {
                    "pageNumber": i + 1,
                    "width": float(rect.width),
                    "height": float(rect.height),
                    # Concatenated (no \\n) so charStart aligns with difflib indices in region_diff.
                    "text": "".join(page_text_parts),
                    "spans": spans_out,
                }
            )
    finally:
        doc.close()
    return {"pages": pages, "pageCount": len(pages)}


def write_layout_json(rel_path: str, layout: dict[str, Any]) -> str:
    root = artifacts_root()
    abs_path = root / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text(json.dumps(layout, ensure_ascii=False), encoding="utf-8")
    return rel_path


def read_layout_json(rel_path: str) -> dict[str, Any] | None:
    abs_path = artifacts_root() / rel_path
    if not abs_path.is_file():
        return None
    return json.loads(abs_path.read_text(encoding="utf-8"))
