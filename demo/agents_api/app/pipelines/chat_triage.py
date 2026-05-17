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


def _clean_display_name(name: str | None) -> str | None:
    if not name:
        return None
    t = " ".join(name.strip().split())
    if not t or len(t) > 64:
        return None
    return t


def _greeting_reply(name: str | None = None) -> str:
    """Warm opener for hi/hello — no chunk-syntax jargon."""
    if name:
        return (
            f"Hi, {name} — I'm RegGPT. Ask me anything about the document you have open "
            "(for example an obligation, deadline, or definition). I'll answer from indexed excerpts with citations."
        )
    return (
        "Hi — I'm RegGPT. Ask me anything about the document you have open "
        "(for example an obligation, deadline, or definition). I'll answer from indexed excerpts with citations."
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
        "I'm RegGPT — a regulatory Q&A assistant for the document scoped in this workspace. "
        "For substantive questions I retrieve short excerpts from your indexed runs and answer with citations "
        "to source text. With compare or ingest-summary context attached, I can also help with change narratives. "
        "I don't provide legal advice. Ask a concrete question when you're ready."
    )


def trivial_chat_reply(message: str, *, user_display_name: str | None = None) -> str | None:
    """Return a short canned reply to skip RAG, or None when the message should go to QnA."""
    raw = message.strip()
    if not raw:
        return None
    session_name = _clean_display_name(user_display_name)
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
            "You're welcome. When you're ready, ask a specific question about the indexed document "
            "and I'll answer from retrieved excerpts with citations."
        )

    bye = re.match(r"^(bye|goodbye|cya|see\s+you|see\s+ya|later)\b", n)
    if bye:
        return "Goodbye — you can return anytime to ask about this document."

    ack = re.match(r"^(ok|okay|sure|got\s+it|alright|sounds\s+good|roger|copy\s+that)\b", n)
    if ack and len(n) < 48:
        return (
            "Understood. When you have a question about the indexed text (for example a section or obligation), "
            "send it here."
        )

    intro = re.match(
        r"^(hi|hello|hey|howdy|hiya|greetings|gm|good\s+morning|good\s+afternoon|good\s+evening)\b[,.\s]+"
        r"(i\s+am|i'?m|my\s+name\s+is)\s+"
        r"([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*){0,2})\s*$",
        n,
    )
    if intro and len(n) < 96:
        raw_name = intro.group(3).strip()
        if 1 < len(raw_name) <= 48 and re.fullmatch(r"[a-z][a-z'-]*(?:\s+[a-z][a-z'-]*)*", raw_name):
            name = " ".join(part.capitalize() for part in raw_name.split())
            return _greeting_reply(name)

    greet = re.match(
        r"^(hi|hello|hey|howdy|hiya|greetings|gm|good\s+morning|good\s+afternoon|good\s+evening)\b",
        n,
    )
    if greet and len(n) < 72:
        return _greeting_reply(session_name)

    return None
