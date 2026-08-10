"""Unit tests asserting bilingual (Urdu + English) instructions in the transcription prompts.

These are pure string assertions on the prompt constants; NO live API calls are made.
"""

from __future__ import annotations

from app.config import Settings
from app.services.transcription_service import (
    CLAUDE_SYSTEM_PROMPT,
    GEMINI_TRANSCRIPTION_PROMPT,
    WHISPER_CONTEXT_PROMPT,
)


def _mentions_urdu(text: str) -> bool:
    return "urdu" in text.lower()


def _mentions_english(text: str) -> bool:
    return "english" in text.lower()


def test_gemini_prompt_mentions_both_languages_and_preservation() -> None:
    prompt = GEMINI_TRANSCRIPTION_PROMPT
    assert _mentions_urdu(prompt), "Gemini prompt must mention Urdu"
    assert _mentions_english(prompt), "Gemini prompt must mention English"

    lower = prompt.lower()
    # Instructs preservation of both languages rather than translating everything away.
    assert "urdu script" in lower, "Gemini prompt must instruct keeping Urdu in Urdu script"
    assert "code-switch" in lower, "Gemini prompt must reference code-switching"
    assert "do not translate or drop either language" in lower

    # Keeps the JSON response contract.
    for key in ("raw_transcript", "cleaned_transcript", "language_detected"):
        assert key in prompt, f"Gemini prompt must keep JSON key {key}"

    # Reflects the mixed-language label.
    assert "ur+en" in lower, "Gemini prompt must document the ur+en mixed label"

    # Preserve medical terms / drug names / dosages verbatim regardless of language.
    assert "drug names" in lower
    assert "dosages" in lower
    assert "verbatim" in lower


def test_claude_cleanup_prompt_mentions_both_languages_and_preservation() -> None:
    prompt = CLAUDE_SYSTEM_PROMPT
    assert _mentions_urdu(prompt), "Claude cleanup prompt must mention Urdu"
    assert _mentions_english(prompt), "Claude cleanup prompt must mention English"

    lower = prompt.lower()
    # Explicitly instructs preserving both, not translating the whole note to English.
    assert "urdu script" in lower, "Claude prompt must instruct keeping Urdu in Urdu script"
    assert "do not translate the whole note into english" in lower
    assert "code-switch" in lower, "Claude prompt must reference code-switching"


def test_whisper_context_prompt_preserves_both_languages() -> None:
    prompt = WHISPER_CONTEXT_PROMPT
    assert _mentions_urdu(prompt), "Whisper context prompt must mention Urdu"
    assert _mentions_english(prompt), "Whisper context prompt must mention English"

    lower = prompt.lower()
    assert "code-switch" in lower
    assert "do not translate or drop either language" in lower


def test_whisper_language_defaults_to_auto_detect() -> None:
    # Must stay unset/None so code-switched Urdu+English audio is not forced to one language.
    assert Settings.model_fields["WHISPER_LANGUAGE"].default is None
