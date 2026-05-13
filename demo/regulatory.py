"""
Regulatory PDF Diff Viewer (v3 — side-by-side)
==============================================
Side-by-side document-level diff between any two ingestion runs of the
same regulatory PDF. Inline word-level highlighting on 1:1 paragraph
replacements; unchanged content is dimmed so changes stand out.

Run with:
    pip install streamlit requests
    streamlit run regulatory_diff_viewer_v3.py
"""

import difflib
import html
import os
import re
from datetime import datetime

import requests
import streamlit as st

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
DEFAULT_QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant:6333")
DEFAULT_QDRANT_KEY = os.environ.get("QDRANT_API_KEY", "")
DEFAULT_RUNS_COLL = os.environ.get("RUNS_COLLECTION", "regulatory_docs_runs")
DEFAULT_CHUNKS_COLL = os.environ.get("CHUNKS_COLLECTION", "regulatory_docs")

st.set_page_config(page_title="Regulatory PDF Diff", layout="wide")

# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------
with st.sidebar:
    st.markdown("### Connection")
    qdrant_url = st.text_input("Qdrant URL", DEFAULT_QDRANT_URL)
    qdrant_key = st.text_input("Qdrant API Key", DEFAULT_QDRANT_KEY, type="password")
    runs_coll = st.text_input("Runs collection", DEFAULT_RUNS_COLL)
    chunks_coll = st.text_input("Chunks collection", DEFAULT_CHUNKS_COLL)

HEADERS = (
    {"api-key": qdrant_key, "Content-Type": "application/json"}
    if qdrant_key
    else {"Content-Type": "application/json"}
)

# ---------------------------------------------------------------------------
# Qdrant
# ---------------------------------------------------------------------------
def qdrant_post(path: str, body: dict) -> dict:
    r = requests.post(f"{qdrant_url.rstrip('/')}{path}", headers=HEADERS, json=body, timeout=30)
    r.raise_for_status()
    return r.json()


@st.cache_data(ttl=30, show_spinner=False)
def fetch_all_runs(_url: str, _key: str, coll: str) -> list[dict]:
    body = {"limit": 1000, "with_payload": True, "with_vector": False}
    out = qdrant_post(f"/collections/{coll}/points/scroll", body)
    points = out.get("result", {}).get("points", []) or []
    runs = [p["payload"] for p in points]
    runs.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
    return runs


@st.cache_data(ttl=30, show_spinner=False)
def fetch_current_chunks(_url: str, _key: str, coll: str, document_url: str) -> list[dict]:
    body = {
        "filter": {"must": [{"key": "metadata.documentUrl", "match": {"value": document_url}}]},
        "limit": 10000,
        "with_payload": True,
        "with_vector": False,
    }
    out = qdrant_post(f"/collections/{coll}/points/scroll", body)
    return out.get("result", {}).get("points", []) or []


# ---------------------------------------------------------------------------
# Diff rendering
# ---------------------------------------------------------------------------
PARA_SPLIT_RE = re.compile(r"\n{2,}")

# Subtle, low-saturation palette so that only the *changes* read as loud.
COLOR_DEL_BG = "#fff3f3"
COLOR_DEL_BORDER = "#d04444"
COLOR_DEL_NUM = "#a04040"
COLOR_INS_BG = "#f1fbf1"
COLOR_INS_BORDER = "#3a9a3a"
COLOR_INS_NUM = "#3a803a"

WORD_DEL_STYLE = (
    "background:#ffd0d0;color:#7a0000;text-decoration:line-through;"
    "padding:1px 4px;border-radius:3px;font-weight:600;"
)
WORD_INS_STYLE = (
    "background:#bff0bf;color:#003800;"
    "padding:1px 4px;border-radius:3px;font-weight:600;"
)
WORD_UNCHANGED_STYLE = "color:#9a9a9a;"  # dim, recedes visually

CELL_BASE = (
    "padding:6px 10px;"
    "vertical-align:top;"
    "font-size:13.5px;"
    "line-height:1.55;"
    "border-bottom:1px solid #f1f1f1;"
    "word-wrap:break-word;"
    "white-space:pre-wrap;"
    "width:50%;"
)
EMPTY_CELL = (
    f'<td style="{CELL_BASE}'
    "background:repeating-linear-gradient(45deg,#fbfbfb,#fbfbfb 5px,#f4f4f4 5px,#f4f4f4 10px);"
    '">&nbsp;</td>'
)


def split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in PARA_SPLIT_RE.split(text or "") if p.strip()]


def cell_html(
    inner_html: str,
    *,
    bg: str | None = None,
    border_left: str | None = None,
    dim: bool = False,
    num: int | None = None,
    num_color: str = "#bbb",
) -> str:
    style = CELL_BASE
    if bg:
        style += f"background:{bg};"
    if border_left:
        style += f"border-left:3px solid {border_left};"
    if dim:
        style += "color:#9a9a9a;"
    num_html = (
        f'<span style="color:{num_color};font-family:ui-monospace,Consolas,monospace;'
        f'font-size:10.5px;margin-right:6px;font-weight:500;">¶{num}</span>'
        if num is not None
        else ""
    )
    return f'<td style="{style}">{num_html}{inner_html}</td>'


def word_diff_split(old_p: str, new_p: str) -> tuple[str, str]:
    """Inline word-level highlighting; unchanged words are dimmed on both sides."""
    old_words = old_p.split()
    new_words = new_p.split()
    matcher = difflib.SequenceMatcher(None, old_words, new_words)

    left_parts: list[str] = []
    right_parts: list[str] = []

    for op, i1, i2, j1, j2 in matcher.get_opcodes():
        old_seg = html.escape(" ".join(old_words[i1:i2]))
        new_seg = html.escape(" ".join(new_words[j1:j2]))
        if op == "equal":
            seg = f'<span style="{WORD_UNCHANGED_STYLE}">{old_seg}</span>'
            left_parts.append(seg)
            right_parts.append(seg)
        elif op == "replace":
            if old_seg:
                left_parts.append(f'<span style="{WORD_DEL_STYLE}">{old_seg}</span>')
            if new_seg:
                right_parts.append(f'<span style="{WORD_INS_STYLE}">{new_seg}</span>')
        elif op == "delete":
            left_parts.append(f'<span style="{WORD_DEL_STYLE}">{old_seg}</span>')
        elif op == "insert":
            right_parts.append(f'<span style="{WORD_INS_STYLE}">{new_seg}</span>')

    return " ".join(p for p in left_parts if p), " ".join(p for p in right_parts if p)


def render_side_by_side(
    old_text: str, new_text: str, context_size: int = 2
) -> tuple[str, dict]:
    old_paras = split_paragraphs(old_text)
    new_paras = split_paragraphs(new_text)
    matcher = difflib.SequenceMatcher(None, old_paras, new_paras)
    opcodes = matcher.get_opcodes()

    rows: list[str] = []
    stats = {"added": 0, "removed": 0, "replaced": 0, "unchanged": 0}

    def append_row(left: str, right: str) -> None:
        rows.append("<tr>" + left + right + "</tr>")

    def collapse_row(n: int) -> None:
        msg = f"… {n} unchanged paragraph{'s' if n != 1 else ''} hidden …"
        rows.append(
            f'<tr><td colspan="2" style="text-align:center;color:#aaa;'
            f"font-style:italic;font-size:12px;padding:5px;background:#fcfcfc;"
            f'border-bottom:1px solid #f1f1f1;">{msg}</td></tr>'
        )

    for k, (op, i1, i2, j1, j2) in enumerate(opcodes):
        if op == "equal":
            run_len = i2 - i1
            stats["unchanged"] += run_len

            if context_size == 0:
                # "Changes only" mode — drop unchanged runs entirely
                continue

            is_first = k == 0
            is_last = k == len(opcodes) - 1

            if run_len <= 2 * context_size + 1 or (is_first and is_last):
                for offset in range(run_len):
                    p_old = old_paras[i1 + offset]
                    p_new = new_paras[j1 + offset]
                    safe_old = html.escape(p_old)
                    safe_new = html.escape(p_new)
                    append_row(
                        cell_html(safe_old, dim=True, num=i1 + offset),
                        cell_html(safe_new, dim=True, num=j1 + offset),
                    )
            else:
                head = 0 if is_first else context_size
                tail = 0 if is_last else context_size
                for offset in range(head):
                    p = old_paras[i1 + offset]
                    safe = html.escape(p)
                    append_row(
                        cell_html(safe, dim=True, num=i1 + offset),
                        cell_html(safe, dim=True, num=j1 + offset),
                    )
                hidden = run_len - head - tail
                if hidden > 0:
                    collapse_row(hidden)
                for offset in range(tail):
                    idx_o = i2 - tail + offset
                    idx_n = j2 - tail + offset
                    safe = html.escape(old_paras[idx_o])
                    append_row(
                        cell_html(safe, dim=True, num=idx_o),
                        cell_html(safe, dim=True, num=idx_n),
                    )

        elif op == "replace":
            stats["replaced"] += max(i2 - i1, j2 - j1)
            if (i2 - i1) == 1 and (j2 - j1) == 1:
                # 1:1 paragraph replacement → inline word diff on both sides
                left_html, right_html = word_diff_split(old_paras[i1], new_paras[j1])
                append_row(
                    cell_html(
                        left_html,
                        border_left=COLOR_DEL_BORDER,
                        num=i1,
                        num_color=COLOR_DEL_NUM,
                    ),
                    cell_html(
                        right_html,
                        border_left=COLOR_INS_BORDER,
                        num=j1,
                        num_color=COLOR_INS_NUM,
                    ),
                )
            else:
                # N:M replacement → pad shorter side with empty cells
                old_block = old_paras[i1:i2]
                new_block = new_paras[j1:j2]
                max_len = max(len(old_block), len(new_block))
                for offset in range(max_len):
                    if offset < len(old_block):
                        left = cell_html(
                            html.escape(old_block[offset]),
                            bg=COLOR_DEL_BG,
                            border_left=COLOR_DEL_BORDER,
                            num=i1 + offset,
                            num_color=COLOR_DEL_NUM,
                        )
                    else:
                        left = EMPTY_CELL
                    if offset < len(new_block):
                        right = cell_html(
                            html.escape(new_block[offset]),
                            bg=COLOR_INS_BG,
                            border_left=COLOR_INS_BORDER,
                            num=j1 + offset,
                            num_color=COLOR_INS_NUM,
                        )
                    else:
                        right = EMPTY_CELL
                    append_row(left, right)

        elif op == "delete":
            stats["removed"] += i2 - i1
            for offset in range(i2 - i1):
                left = cell_html(
                    html.escape(old_paras[i1 + offset]),
                    bg=COLOR_DEL_BG,
                    border_left=COLOR_DEL_BORDER,
                    num=i1 + offset,
                    num_color=COLOR_DEL_NUM,
                )
                append_row(left, EMPTY_CELL)

        elif op == "insert":
            stats["added"] += j2 - j1
            for offset in range(j2 - j1):
                right = cell_html(
                    html.escape(new_paras[j1 + offset]),
                    bg=COLOR_INS_BG,
                    border_left=COLOR_INS_BORDER,
                    num=j1 + offset,
                    num_color=COLOR_INS_NUM,
                )
                append_row(EMPTY_CELL, right)

    if not rows:
        rows.append(
            '<tr><td colspan="2" style="text-align:center;color:#666;'
            'padding:30px;font-size:14px;">No changes to display.</td></tr>'
        )

    header = (
        '<thead><tr>'
        '<th style="padding:8px 10px;text-align:left;background:#f6f6f6;'
        "border-bottom:2px solid #e0e0e0;width:50%;font-size:12px;color:#555;"
        'text-transform:uppercase;letter-spacing:0.5px;">Previous</th>'
        '<th style="padding:8px 10px;text-align:left;background:#f6f6f6;'
        "border-bottom:2px solid #e0e0e0;width:50%;font-size:12px;color:#555;"
        'text-transform:uppercase;letter-spacing:0.5px;">Current</th>'
        "</tr></thead>"
    )
    table = (
        '<div style="border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;'
        'background:#fff;">'
        '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">'
        f"{header}<tbody>{''.join(rows)}</tbody></table></div>"
    )
    return table, stats


def render_unified_diff(old_text: str, new_text: str) -> str:
    diff_lines = list(
        difflib.unified_diff(
            (old_text or "").split("\n"),
            (new_text or "").split("\n"),
            fromfile="previous",
            tofile="current",
            lineterm="",
            n=3,
        )
    )
    out = []
    for line in diff_lines:
        esc = html.escape(line) or "&nbsp;"
        if line.startswith("+++") or line.startswith("---"):
            out.append(f'<div style="color:#888;font-weight:bold;">{esc}</div>')
        elif line.startswith("@@"):
            out.append(f'<div style="background:#eef;color:#446;padding:2px 6px;">{esc}</div>')
        elif line.startswith("+"):
            out.append(f'<div style="background:#e8f7e8;color:#0a4a0a;padding:2px 6px;">{esc}</div>')
        elif line.startswith("-"):
            out.append(f'<div style="background:#fbebeb;color:#7a1a1a;padding:2px 6px;">{esc}</div>')
        else:
            out.append(f'<div style="padding:2px 6px;color:#666;">{esc}</div>')
    return (
        '<div style="font-family:ui-monospace,Consolas,monospace;font-size:12.5px;'
        'white-space:pre-wrap;border:1px solid #e5e5e5;border-radius:6px;'
        'background:#fafafa;padding:6px;">' + "".join(out) + "</div>"
    )


def fmt_ts(ts: str) -> str:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).strftime(
            "%Y-%m-%d %H:%M UTC"
        )
    except Exception:
        return ts or "unknown"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
st.title("📋 Regulatory Document Change History")
st.caption(
    "Side-by-side diffs between any two ingestion runs. "
    "Embedding-level (chunk) detail is in the second tab."
)

if not qdrant_key:
    st.warning("Enter the Qdrant API key in the sidebar to continue.")
    st.stop()

try:
    runs = fetch_all_runs(qdrant_url, qdrant_key, runs_coll)
except Exception as e:
    st.error(f"Could not fetch runs from Qdrant: {e}")
    st.stop()

if not runs:
    st.info("No ingestion runs recorded yet.")
    st.stop()

doc_urls = sorted({r.get("documentUrl", "") for r in runs if r.get("documentUrl")})
selected_url = st.selectbox("Document", doc_urls)
runs_for_doc = [r for r in runs if r.get("documentUrl") == selected_url]

col_a, col_b = st.columns(2)
run_options = list(range(len(runs_for_doc)))


def label_for(i: int) -> str:
    r = runs_for_doc[i]
    s = r.get("summary", {}) or {}
    return f"{fmt_ts(r.get('timestamp', ''))}   (+{s.get('newChunks', 0)} / -{s.get('removedChunks', 0)})"


with col_a:
    current_idx = st.selectbox("Current run", run_options, index=0, format_func=label_for)
with col_b:
    default_baseline = 1 if len(runs_for_doc) >= 2 else 0
    baseline_idx = st.selectbox(
        "Compare against",
        run_options,
        index=default_baseline,
        format_func=label_for,
    )

current_run = runs_for_doc[current_idx]
baseline_run = runs_for_doc[baseline_idx] if baseline_idx != current_idx else None

tab_doc, tab_chunks, tab_now = st.tabs(
    ["📜 Document diff", "🔍 Embedding-level changes", "📄 Current state"]
)

# --- Document diff tab -------------------------------------------------------
with tab_doc:
    if baseline_run is None:
        st.info("Pick a different baseline in the 'Compare against' selector to see a diff.")
    else:
        old_text = baseline_run.get("fullText") or ""
        new_text = current_run.get("fullText") or ""

        if not old_text or not new_text:
            st.warning(
                "One of the runs is missing `fullText`. Trigger a fresh ingestion after "
                "wiring `fullText` into the workflow — older runs won't have it retroactively."
            )
        else:
            ctrl1, ctrl2 = st.columns([1, 2])
            with ctrl1:
                view_mode = st.radio(
                    "Style",
                    ["Side-by-side", "Unified (git-style)"],
                    horizontal=True,
                    label_visibility="collapsed",
                )
            with ctrl2:
                if view_mode == "Side-by-side":
                    context_size = st.slider(
                        "Context paragraphs around each change (0 = changes only)",
                        min_value=0,
                        max_value=10,
                        value=2,
                    )
                else:
                    context_size = 3  # unused, but the function takes it

            if view_mode == "Side-by-side":
                rendered, stats = render_side_by_side(
                    old_text, new_text, context_size=context_size
                )
                s1, s2, s3, s4 = st.columns(4)
                s1.metric("Replaced", stats["replaced"])
                s2.metric("Added", stats["added"])
                s3.metric("Removed", stats["removed"])
                s4.metric("Unchanged", stats["unchanged"])
                st.markdown(rendered, unsafe_allow_html=True)
            else:
                st.markdown(render_unified_diff(old_text, new_text), unsafe_allow_html=True)

# --- Chunk-level tab ---------------------------------------------------------
with tab_chunks:
    st.caption(
        "What actually moved through the embedding pipeline. Chunk boundaries shift "
        "across runs, so this view is for verifying re-embedding cost, not for reading the change."
    )
    added = current_run.get("added", []) or []
    removed_list = current_run.get("removed", []) or []
    sub_a, sub_b = st.tabs(
        [f"➕ Added chunks ({len(added)})", f"🗑️ Removed chunks ({len(removed_list)})"]
    )
    with sub_a:
        if not added:
            st.info("No chunks were added in this run.")
        for c in added:
            with st.expander(
                f"➕ Chunk #{c.get('chunkIndex', '?')}  ({len(c.get('chunkText', ''))} chars)"
            ):
                st.markdown(
                    f'<div style="background:{COLOR_INS_BG};padding:10px;border-radius:6px;'
                    f'white-space:pre-wrap;border-left:3px solid {COLOR_INS_BORDER};">'
                    f'{html.escape(c.get("chunkText", ""))}</div>',
                    unsafe_allow_html=True,
                )
    with sub_b:
        if not removed_list:
            st.info("No chunks were removed in this run.")
        for c in removed_list:
            with st.expander(
                f"🗑️ Chunk #{c.get('chunkIndex', '?')}  "
                f"(was added in {fmt_ts(c.get('previousVersionId', '') or '')})"
            ):
                st.markdown(
                    f'<div style="background:{COLOR_DEL_BG};padding:10px;border-radius:6px;'
                    f'white-space:pre-wrap;text-decoration:line-through;color:#7a1a1a;'
                    f'border-left:3px solid {COLOR_DEL_BORDER};">'
                    f'{html.escape(c.get("chunkText", ""))}</div>',
                    unsafe_allow_html=True,
                )

# --- Current state tab -------------------------------------------------------
with tab_now:
    try:
        live = fetch_current_chunks(qdrant_url, qdrant_key, chunks_coll, selected_url)
    except Exception as e:
        st.error(f"Could not fetch current chunks: {e}")
        live = []
    live.sort(key=lambda p: (p.get("payload") or {}).get("metadata", {}).get("chunkIndex", 0))
    versions = sorted(
        {(p.get("payload") or {}).get("metadata", {}).get("versionId", "") for p in live}
    )
    palette = ["#f3f3f3", "#fff7d6", "#ffe7c2", "#e0f0ff", "#d9f5d9", "#f5d9f0"]
    color_map = {v: palette[i % len(palette)] for i, v in enumerate(versions)}

    st.caption(f"{len(live)} live chunks for this document, color-coded by the run that introduced them.")
    legend_parts = [
        f'<span style="background:{c};padding:2px 8px;border-radius:4px;">{fmt_ts(v)}</span>'
        for v, c in color_map.items()
        if v
    ]
    if legend_parts:
        st.markdown(
            "**Versions present:** " + " &nbsp; ".join(legend_parts),
            unsafe_allow_html=True,
        )
    for p in live:
        meta = (p.get("payload") or {}).get("metadata", {}) or {}
        idx = meta.get("chunkIndex", "?")
        version = meta.get("versionId", "")
        content = html.escape((p.get("payload") or {}).get("content", ""))
        bg = color_map.get(version, "#f3f3f3")
        with st.expander(f"#{idx} — added in {fmt_ts(version)}"):
            st.markdown(
                f'<div style="background:{bg};padding:10px;border-radius:6px;white-space:pre-wrap;">{content}</div>',
                unsafe_allow_html=True,
            )
