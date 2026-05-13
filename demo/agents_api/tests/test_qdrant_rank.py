"""Keyword ranking for retrieve_qna."""

from app.qdrant_client import rank_chunks_keyword, section_refs_from_question


def test_section_refs_from_question_finds_dotted_section() -> None:
    assert "14.0305" in section_refs_from_question("Is there a section 14.0305, and what does it require?")


def test_rank_boosts_chunk_containing_section_number() -> None:
    chunks = [
        {"chunk_index": 1, "content": "Independent testing laboratories must …"},
        {"chunk_index": 2, "content": "Regulation 14.0305. Supplemental security disclosure for networked components."},
        {"chunk_index": 3, "content": "Peer review requirements …"},
    ]
    q = "Is there a section 14.0305, and what does it require?"
    top = rank_chunks_keyword(q, chunks, top_k=2)
    assert top[0]["chunk_index"] == 2
