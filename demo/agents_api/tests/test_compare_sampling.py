"""Compare agent uses head+tail sampling so long regs are not only compared by their opening."""

from app.agents.compare import (
    _format_ingest_chunk_deltas,
    _head_tail_sample,
    _page_indexed_change_list,
    _split_pages,
    _unified_diff_excerpt,
)
from app.schemas import CompareChunkDelta


def test_head_tail_short_string_unchanged() -> None:
    s = "short"
    assert _head_tail_sample(s, 12000) == "short"


def test_head_tail_long_includes_trailing_content() -> None:
    prefix = "A" * 3000
    middle = "M" * 20_000
    suffix = "Z" * 3000
    s = prefix + middle + suffix
    out = _head_tail_sample(s, 12_000)
    assert "ZZZ" in out
    assert "AAA" in out
    assert "middle of document omitted" in out


def test_unified_diff_finds_change_after_long_prefix() -> None:
    """Edits only after many identical lines must still appear (Readable-diff parity)."""
    prefix = "".join(f"unchanged line {i}\n" for i in range(1200))
    old = prefix + "part one\npart two\n" + "trailer\n" * 5
    new = prefix + "part one part two\n" + "trailer\n" * 5
    ex = _unified_diff_excerpt(old, new, max_lines=20_000, max_chars=30_000)
    assert "part one" in ex
    assert "-" in ex or "+" in ex


def test_format_ingest_chunk_deltas_includes_excerpts() -> None:
    rows = [
        CompareChunkDelta(kind="added", chunk_index=3, excerpt="new obligation text"),
        CompareChunkDelta(kind="removed", chunk_index=2, excerpt="old obligation text"),
    ]
    s = _format_ingest_chunk_deltas(rows)
    assert "ADDED chunk_index=3" in s
    assert "new obligation text" in s
    assert "REMOVED chunk_index=2" in s


def test_format_ingest_chunk_deltas_empty() -> None:
    assert _format_ingest_chunk_deltas([]) == ""


def test_split_pages_form_feed() -> None:
    assert _split_pages("a\f\f b") == ["a", " b"]  # empty segments dropped -> actually "a", " b" - check split
    # "a\f\f b" -> split \f gives ["a", "", " b"] -> filter empty -> ["a", " b"]
    p = _split_pages("page1\fpage2")
    assert len(p) == 2 and p[0] == "page1" and p[1] == "page2"


def test_page_indexed_list_two_pages() -> None:
    old = "p1 same\n\f\np2 line a\np2 line b\n"
    new = "p1 same\n\f\np2 merged line\n"
    s = _page_indexed_change_list(old, new)
    assert "Logical page 2" in s
