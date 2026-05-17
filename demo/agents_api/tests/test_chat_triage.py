"""Tests for conversational short-circuit triage."""

from __future__ import annotations

import pytest

from app.pipelines.chat_triage import trivial_chat_reply


@pytest.mark.parametrize(
    "msg",
    [
        "hi",
        "Hi!",
        "Hello there",
        "hey",
        "good morning",
        "GM",
        "thanks",
        "Thank you so much",
        "bye",
        "ok",
        "sure",
    ],
)
def test_trivial_chat_reply_matches(msg: str) -> None:
    assert trivial_chat_reply(msg) is not None


@pytest.mark.parametrize(
    "msg",
    [
        "What is Regulation 14?",
        "hi what does section 14.030 say",
        "tell me about the tax rate",
        "can you summarize the changes",
        "is there a deadline for filing?",
        "hello I need help with section 12",
    ],
)
def test_trivial_chat_reply_not_triggered(msg: str) -> None:
    assert trivial_chat_reply(msg) is None


@pytest.mark.parametrize(
    "msg",
    [
        "what kind of assistance you can give?",
        "What sort of help can you offer?",
        "How can you help?",
        "What can you do?",
        "Who are you?",
    ],
)
def test_trivial_chat_capability_meta_skips_rag(msg: str) -> None:
    out = trivial_chat_reply(msg)
    assert out is not None
    assert "reggpt" in out.lower()
    assert "citation" in out.lower() or "indexed" in out.lower()


def test_trivial_chat_plain_hi_uses_reggpt_voice() -> None:
    out = trivial_chat_reply("Hi")
    assert out is not None
    assert "RegGPT" in out
    assert "[chunk" not in out


def test_trivial_chat_hi_with_session_display_name() -> None:
    out = trivial_chat_reply("Hi", user_display_name="demo")
    assert out is not None
    assert "Demo" in out
    assert "RegGPT" in out


def test_trivial_chat_self_introduction() -> None:
    out = trivial_chat_reply("Hi, I am Joy")
    assert out is not None
    assert "Joy" in out
    assert "Hi" in out


def test_trivial_chat_self_introduction_multipart_name() -> None:
    out = trivial_chat_reply("hello i'm mary jane")
    assert out is not None
    assert "Mary Jane" in out


