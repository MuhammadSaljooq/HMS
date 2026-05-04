from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Transcription
from app.models.enums import TranscriptionStatus

logger = logging.getLogger(__name__)


CLAUDE_SYSTEM_PROMPT = """You are a medical transcription specialist for a hospital in Pakistan. You receive raw speech-to-text output that may contain:
- Code-switching between Urdu and English (common in Pakistani medical settings)
- Medical terminology in either language
- Informal speech patterns, filler words, repetitions

Your job is to:
1. Produce a clean, professional English transcription
2. Translate any Urdu portions into English accurately
3. Preserve all medical terms, drug names, and dosages exactly
4. Structure the output as a medical note with these sections if detectable:
   - Chief Complaint
   - History of Present Illness
   - Examination Findings
   - Assessment/Diagnosis
   - Plan/Prescription
5. Remove filler words (um, uh, acha, theek hai used as fillers)
6. Fix obvious transcription errors using medical context
7. Return ONLY the cleaned transcription, no commentary

If the audio is purely administrative (appointment booking, reception queries), just return a clean English paragraph without medical sections.
"""

# Guides Whisper for Urdu–English medical speech without forcing a single language
WHISPER_CONTEXT_PROMPT = (
    "Medical consultation in Pakistan with Urdu and English mixed speech. "
    "Terms: chief complaint, fever, BP, sugar, diabetes, dard, zakham, "
    "tablet, injection, dose, allergy, chest, heart, sugar test, pathology."
)


async def _http_post_with_retries(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    max_attempts: int = 4,
    base_delay: float = 1.5,
    **kwargs: Any,
) -> httpx.Response:
    last_exc: Exception | None = None
    for attempt in range(max_attempts):
        try:
            r = await client.request(method, url, **kwargs)
            if r.status_code == 429:
                retry_after = float(r.headers.get("retry-after", base_delay * (2**attempt)))
                logger.warning("HTTP 429 from %s; retry in %ss (attempt %s)", url, retry_after, attempt + 1)
                await asyncio.sleep(min(retry_after, 60.0))
                continue
            if r.status_code >= 500:
                delay = base_delay * (2**attempt)
                logger.warning("HTTP %s from %s; retry in %ss", r.status_code, url, delay)
                await asyncio.sleep(delay)
                continue
            if r.status_code >= 400:
                r.raise_for_status()
            return r
        except httpx.TimeoutException as exc:
            last_exc = exc
            delay = base_delay * (2**attempt)
            logger.warning("Timeout calling %s; retry in %ss", url, delay)
            await asyncio.sleep(delay)
        except httpx.RequestError as exc:
            last_exc = exc
            delay = base_delay * (2**attempt)
            logger.warning("Network error calling %s: %s; retry in %ss", url, exc, delay)
            await asyncio.sleep(delay)
    if last_exc:
        raise last_exc
    raise httpx.HTTPError(f"Exceeded retries for {url}")


async def _whisper_transcribe(
    audio_bytes: bytes,
    filename: str,
    content_type: str | None,
) -> tuple[str, str | None]:
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    headers = {"Authorization": f"Bearer {settings.OPENAI_API_KEY}"}
    files = {"file": (filename, audio_bytes, content_type or "application/octet-stream")}
    data: dict[str, str] = {
        "model": "whisper-1",
        "response_format": "verbose_json",
        "prompt": WHISPER_CONTEXT_PROMPT,
    }
    if settings.WHISPER_LANGUAGE:
        data["language"] = settings.WHISPER_LANGUAGE

    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await _http_post_with_retries(
            client,
            "POST",
            "https://api.openai.com/v1/audio/transcriptions",
            headers=headers,
            data=data,
            files=files,
        )
    payload = r.json()
    text = payload.get("text") or ""
    lang = payload.get("language")
    return text, lang


async def _claude_cleanup(raw: str) -> str:
    settings = get_settings()
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured.")
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 4096,
        "system": CLAUDE_SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": raw}],
    }
    async with httpx.AsyncClient(timeout=180.0) as client:
        r = await _http_post_with_retries(
            client,
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers=headers,
            json=body,
        )
    data = r.json()
    parts = data.get("content") or []
    for p in parts:
        if p.get("type") == "text":
            return p.get("text") or ""
    return ""


def parse_sections(cleaned: str | None) -> dict[str, str | None]:
    """
    Parse section headings from Claude's structured English note.
    Recognizes markdown-style or plain line headers.
    """
    keys = ("chief_complaint", "history", "examination", "assessment", "plan")
    out: dict[str, str | None] = {k: None for k in keys}
    out["full_note"] = cleaned

    if not cleaned or not cleaned.strip():
        return out

    header_map: list[tuple[re.Pattern[str], str]] = [
        (re.compile(r"(?i)^(#{1,6}\s*|\*\*\s*)?chief\s+complaint(\s*\*\*)?\s*:?\s*$"), "chief_complaint"),
        (re.compile(r"(?i)^(#{1,6}\s*|\*\*\s*)?history\s+of\s+present\s+illness(\s*\*\*)?\s*:?\s*$"), "history"),
        (re.compile(r"(?i)^(#{1,6}\s*|\*\*\s*)?examination\s+findings(\s*\*\*)?\s*:?\s*$"), "examination"),
        (re.compile(r"(?i)^(#{1,6}\s*|\*\*\s*)?assessment\s*/\s*diagnosis(\s*\*\*)?\s*:?\s*$"), "assessment"),
        (re.compile(r"(?i)^(#{1,6}\s*|\*\*\s*)?assessment(\s*\*\*)?\s*:?\s*$"), "assessment"),
        (re.compile(r"(?i)^(#{1,6}\s*|\*\*\s*)?plan\s*/\s*prescription(\s*\*\*)?\s*:?\s*$"), "plan"),
        (re.compile(r"(?i)^(#{1,6}\s*|\*\*\s*)?plan(\s*\*\*)?\s*:?\s*$"), "plan"),
    ]

    lines = cleaned.splitlines()
    current: str | None = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal buf, current
        if not current or not buf:
            buf = []
            return
        chunk = "\n".join(buf).strip()
        if chunk:
            prev = out.get(current)
            out[current] = f"{prev}\n\n{chunk}" if prev else chunk
        buf = []

    for line in lines:
        stripped = line.strip()
        matched: str | None = None
        for pat, key in header_map:
            if pat.match(stripped):
                matched = key
                break
        if matched:
            flush()
            current = matched
        else:
            buf.append(line)
    flush()
    return out


def build_pipeline_payload(tr: Transcription) -> dict[str, Any]:
    sections = parse_sections(tr.cleaned_transcript)
    return {
        "transcription_id": str(tr.id),
        "raw_transcript": tr.raw_transcript,
        "cleaned_transcript": tr.cleaned_transcript,
        "language_detected": tr.language_detected,
        "status": tr.status.value,
        "sections": {
            "chief_complaint": sections.get("chief_complaint"),
            "history": sections.get("history"),
            "examination": sections.get("examination"),
            "assessment": sections.get("assessment"),
            "plan": sections.get("plan"),
        },
    }


async def process_transcription(db: AsyncSession, transcription_id: UUID) -> Transcription:
    settings = get_settings()
    tr = await db.get(Transcription, transcription_id)
    if tr is None:
        raise ValueError("Transcription not found.")

    tr.status = TranscriptionStatus.processing
    await db.flush()

    try:
        if not settings.OPENAI_API_KEY or not settings.ANTHROPIC_API_KEY:
            tr.status = TranscriptionStatus.failed
            tr.raw_transcript = tr.raw_transcript or ""
            tr.cleaned_transcript = (
                "Transcription services are not fully configured. "
                "Set OPENAI_API_KEY and ANTHROPIC_API_KEY to enable Whisper + Claude cleanup."
            )
            await db.flush()
            await db.refresh(tr)
            return tr

        path = tr.audio_file_url
        if path.startswith("http"):
            async with httpx.AsyncClient(timeout=180.0) as client:
                resp = await _http_post_with_retries(client, "GET", path)
                audio_bytes = resp.content
            filename = path.rsplit("/", 1)[-1]
        else:
            from pathlib import Path

            p = Path(path)
            audio_bytes = p.read_bytes()
            filename = p.name

        raw, lang = await _whisper_transcribe(audio_bytes, filename, None)
        cleaned = await _claude_cleanup(raw)
        tr.raw_transcript = raw
        tr.cleaned_transcript = cleaned
        tr.language_detected = lang
        tr.status = TranscriptionStatus.completed
    except httpx.HTTPStatusError as exc:
        tr.status = TranscriptionStatus.failed
        tr.raw_transcript = tr.raw_transcript or ""
        detail = exc.response.text[:2000] if exc.response is not None else str(exc)
        tr.cleaned_transcript = f"HTTP error from upstream API ({exc.response.status_code}): {detail}"
        logger.exception("Transcription HTTP failure")
    except Exception as exc:  # noqa: BLE001
        tr.status = TranscriptionStatus.failed
        tr.raw_transcript = tr.raw_transcript or ""
        tr.cleaned_transcript = f"Transcription failed: {exc!s}"
        logger.exception("Transcription failure")
    await db.flush()
    await db.refresh(tr)
    return tr


def sections_json(cleaned: str | None) -> str:
    return json.dumps(parse_sections(cleaned))
