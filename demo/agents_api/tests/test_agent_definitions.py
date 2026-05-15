"""Agent prompt packs stay wired and non-empty."""

from app.agents.agent_definitions import (
    compare_system_prompt,
    qna_system_prompt,
    supervisor_llm_system_prompt,
    summary_system_prompt,
)


def test_regulatory_system_prompts_include_core_sections() -> None:
    for fn in (
        supervisor_llm_system_prompt,
        summary_system_prompt,
        compare_system_prompt,
        qna_system_prompt,
    ):
        text = fn()
        assert len(text) > 200
        assert "Persona:" in text or "Intent process" in text
        assert "Guardrails:" in text or "guardrails" in text.lower()
