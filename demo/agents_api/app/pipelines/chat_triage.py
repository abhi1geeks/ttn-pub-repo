"""Lightweight triage for hosted chat and agentic workflow.

Skips retrieval + QnA when the user message is clearly non-informational (greetings,
thanks, etc.) so the model is not pushed to invent document answers or citation spam.
"""

from __future__ import annotations

import re

# User is asking what the assistant/tool does (not a question about the regulation text).
_ASSISTANT_CAPABILITY = re.compile(
    r"(?is)^.{0,240}?\b("
    r"what\s+kind\s+of\s+(help|assistance|support)|"
    r"what\s+(sort|type)\s+of\s+(help|assistance|support)|"
    r"how\s+can\s+you\s+help\b|"
    r"what\s+can\s+you\s+(do|offer|provide)(\s+for\s+me)?\s*[?.!]?\s*$|"
    r"what\s+do\s+you\s+do(\s+here)?\s*[?.!]?\s*$|"
    r"who\s+are\s+you\s*[?.!]?\s*$|"
    r"what\s+is\s+this\s+(tool|chat|bot|assistant)\b"
    r")"
)

# If these appear, the user likely wants document-grounded QnA, not a capability blurb.
_REGULATORY_TOPIC_HINT = re.compile(
    r"(?i)\b("
    r"section|subsection|regulation|reg\.?|article|clause|paragraph|"
    r"obligation|requirement|deadline|chunk|version|pdf|ingest|"
    r"compare|diff|redline|summary|materiality"
    r")\b"
)

# Signals the user is asking something about the corpus (not pure chitchat).
_SUBSTANTIVE = re.compile(
    r"(?i)\b("
    r"what|when|where|which|who|whose|whom|how|why|"
    r"explain|describe|define|list|outline|summarize|summary|compare|diff|redline|"
    r"section|regulation|reg\.?|subsection|clause|paragraph|article|"
    r"obligation|requirement|deadline|penalty|fee|tax|must|shall|may not|prohibit|"
    r"tell\s+me|show\s+me|give\s+me|walk\s+me|help\s+me|need\s+to|want\s+to|looking\s+for|"
    r"is\s+there|are\s+there|does\s+the|do\s+the|can\s+you|could\s+you|would\s+you|"
    r"meaning|applies|apply|true|false|correct|confirm|verify"
    r")\b"
)


def _assistant_capability_reply(message: str) -> str | None:
    """Short, honest capability text for meta questions—no RAG, no chunk citations."""
    raw = message.strip()
    if not raw or len(raw) > 240:
        return None
    if _REGULATORY_TOPIC_HINT.search(raw):
        return None
    if not _ASSISTANT_CAPABILITY.search(raw):
        return None
    return (
        "For substantive questions about the indexed document (obligations, definitions, sections, deadlines, "
        "etc.), I retrieve short excerpts and answer with explicit [chunk:N] citations so each claim is tied to "
        "source text. When you attach compare or ingest-summary context, the workflow can also route to compare "
        "or summary style answers. I do not provide legal advice or invent obligations that are not supported "
        "by the excerpts you scope. Ask a concrete question about the document when you want a grounded answer."
    )


def trivial_chat_reply(message: str) -> str | None:
    """Return a short canned reply to skip RAG, or None when the message should go to QnA."""
    raw = message.strip()
    if not raw:
        return None
    cap = _assistant_capability_reply(raw)
    if cap is not None:
        return cap
    if len(raw) > 200:
        return None
    if "?" in raw and len(raw) > 12:
        return None
    if _SUBSTANTIVE.search(raw):
        return None

    n = re.sub(r"\s+", " ", raw.lower()).strip()
    n = n.strip('!?.,;:\'"“”()[]').strip()
    if len(n) > 80:
        return None

    thanks = re.match(r"^(thanks|thank\s+you|thx|ty|much\s+appreciated)\b", n)
    if thanks:
        return (
            "You are welcome. When you are ready, ask a specific question about the indexed document "
            "and I will answer from retrieved excerpts with citations."
        )

    bye = re.match(r"^(bye|goodbye|cya|see\s+you|see\s+ya|later)\b", n)
    if bye:
        return "Goodbye. You can return anytime to ask about this document."

    ack = re.match(r"^(ok|okay|sure|got\s+it|alright|sounds\s+good|roger|copy\s+that)\b", n)
    if ack and len(n) < 48:
        return (
            "Understood. When you have a question about the indexed text (for example a section or obligation), "
            "send it here."
        )

    greet = re.match(
        r"^(hi|hello|hey|howdy|hiya|greetings|gm|good\s+morning|good\s+afternoon|good\s+evening)\b",
        n,
    )
    if greet and len(n) < 72:
        return (
            "Hello. Ask a specific question about the indexed document (for example a section, definition, "
            "or obligation), and I will answer from retrieved excerpts using [chunk:N] citations."
        )

    return None
