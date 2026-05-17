"""Tests for contextual chat follow-up suggestions."""

from app.pipelines.followup_suggestions import build_suggested_followups, _focus_topic
from app.schemas import AgenticWorkflowRequest, AgenticWorkflowResponse, QnAAgentResponse


def test_focus_topic_prefers_long_substantive_token() -> None:
    assert _focus_topic("What are the filing deadlines for manufacturers?") == "manufacturers"


def test_focus_topic_skips_meta_words_to_avoid_cyclic_label() -> None:
    assert _focus_topic("What exceptions apply to gaming labs?") == "gaming"


def test_focus_topic_quoted_phrase() -> None:
    assert _focus_topic('Explain "Type II gaming" obligations') == "type ii gaming"


def test_qna_with_citations_gets_topic_followups() -> None:
    body = AgenticWorkflowRequest(
        query="What are the testing lab requirements?",
        document_url="https://example.com/doc",
    )
    resp = AgenticWorkflowResponse(
        intent="qna",
        intent_id=3,
        supervisor_route="qna",
        executed=True,
        qna=QnAAgentResponse(
            answer="Labs must … [chunk:2]",
            cited_chunk_indices=[2, 5],
            model_id="test",
            stub=False,
        ),
    )
    su = build_suggested_followups(body, resp)
    assert len(su) >= 2
    assert all(isinstance(s, str) and len(s) > 10 for s in su)
    joined = " ".join(su).lower()
    assert "requirements" in joined or "testing" in joined


def test_conversational_route_generic_starters() -> None:
    body = AgenticWorkflowRequest(query="Hi", document_url="https://example.com/doc")
    resp = AgenticWorkflowResponse(
        intent="qna",
        intent_id=3,
        supervisor_route="conversational",
        executed=True,
        qna=QnAAgentResponse(answer="Hello…", cited_chunk_indices=[], model_id="none", stub=False),
    )
    su = build_suggested_followups(body, resp)
    assert len(su) == 2
    assert all(isinstance(s, str) and len(s) > 10 for s in su)


def test_needs_document_url() -> None:
    body = AgenticWorkflowRequest(query="What is section 4?", document_url=None)
    resp = AgenticWorkflowResponse(
        intent="qna",
        intent_id=3,
        supervisor_route="qna",
        executed=False,
        needs_input=["document_url"],
    )
    su = build_suggested_followups(body, resp)
    assert len(su) >= 1
    assert "document" in " ".join(su).lower()
