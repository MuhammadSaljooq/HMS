from __future__ import annotations

import asyncio
import base64
import json
import logging
import mimetypes
import re
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Transcription
from app.models.enums import TranscriptionStatus

logger = logging.getLogger(__name__)


CLAUDE_SYSTEM_PROMPT = """You are a medical transcription specialist for a hospital in Pakistan. You receive raw speech-to-text output from bilingual doctor-patient consultations that may contain:
- Code-switching between Urdu and English within the same sentence (common in Pakistani medical settings)
- Medical terminology in either language
- Informal speech patterns, filler words, repetitions

These consultations are genuinely bilingual. Faithfully preserve BOTH Urdu and English. Do NOT translate the whole note into English and do NOT drop either language.

Your job is to:
1. Produce a clean, clinician-readable note that preserves both Urdu and English as spoken.
2. Keep clinically meaningful Urdu terms in Urdu script where an English rendering would lose nuance; a bilingual Urdu+English note is acceptable and preferred over a lossy full translation.
3. Preserve all medical terms, drug names, and dosages exactly, regardless of language.
4. Structure the output as a medical note with these sections if detectable:
   - Chief Complaint
   - History of Present Illness
   - Examination Findings
   - Assessment/Diagnosis
   - Plan/Prescription
5. Remove filler words (um, uh, acha, theek hai used as fillers)
6. Fix obvious transcription errors using medical context
7. Do not fabricate findings, diagnoses, or prescriptions
8. Return ONLY the cleaned transcription, no commentary

If the audio is purely administrative (appointment booking, reception queries), just return a clean readable paragraph (bilingual where the speaker used both languages) without medical sections.
"""

# Guides Whisper for code-switched Urdu+English medical speech without forcing a single language.
# WHISPER_LANGUAGE must stay unset/auto (None) so both Urdu and English are captured.
WHISPER_CONTEXT_PROMPT = (
    "Bilingual medical consultation in Pakistan: doctor and patient code-switch "
    "between Urdu and English within the same sentence. Transcribe both languages "
    "faithfully, keeping Urdu speech in Urdu script and English speech in English; "
    "do not translate or drop either language. "
    "Terms: chief complaint, fever, BP, sugar, diabetes, dard, zakham, "
    "tablet, injection, dose, allergy, chest, heart, sugar test, pathology."
)

GEMINI_TRANSCRIPTION_PROMPT = """You are an expert Pakistani medical audio transcriber for bilingual doctor-patient consultations.

Pakistani clinic consultations are naturally code-switched: speakers move between Urdu and English within the same sentence. The audio may contain:
- Urdu
- English
- Roman Urdu
- code-switching between Urdu and English within a single utterance
- clinical shorthand and medicine names
- background noise, overlapping speech, and informal filler words

Your task is to faithfully capture BOTH languages exactly as spoken, then produce a clinician-readable note. Do NOT silently translate everything into one language.

Return strict JSON with exactly these keys:
- raw_transcript: a near-verbatim transcript of the code-switched Urdu and English audio. Keep Urdu speech in Urdu script and English speech in English, exactly as spoken. Do NOT translate or drop either language.
- cleaned_transcript: a clinician-readable clinical note. Keep clinically meaningful Urdu terms (in Urdu script) where an English rendering would lose nuance; a bilingual Urdu+English note is acceptable and preferred over a lossy full translation.
- language_detected: a short label reflecting the actual language mix. Use "ur+en" when both Urdu and English are present, "en" for English only, "ur" for Urdu only, or "roman-urdu" for Roman Urdu.

Critical rules:
- Return JSON only. No markdown fences. No extra commentary.
- Transcribe code-switched Urdu and English accurately; keep Urdu in Urdu script and English in English in raw_transcript. Do NOT translate or drop either language.
- Preserve medical terms, drug names, and dosages verbatim regardless of language.
- Preserve numbers, units, dates, durations, and symptoms exactly.
- Do not fabricate or hallucinate missing findings, diagnoses, or prescriptions.
- If a word is uncertain, use the closest reasonable transcription and keep it conservative.
- In cleaned_transcript, do not force a full English translation; retain Urdu clinical terms where translating would lose nuance (a bilingual note is acceptable).
- If the audio is administrative rather than clinical, cleaned_transcript should be a clean readable paragraph (bilingual where the speaker used both languages).
- If the content is clinical, cleaned_transcript should use clear section headings when supported by the audio:
  Chief Complaint
  History of Present Illness
  Examination Findings
  Assessment
  Plan

Examples of intended behavior (note both languages are preserved, not translated away):
- raw: "patient ko 3 din se بخار ہے, aur cough bhi hai" -> cleaned keeps "بخار" and English "cough" as spoken.
- raw: "sugar زیادہ رہتی ہے" -> keep "زیادہ" in Urdu script rather than translating the whole line to English.
- raw: "dawa جاری رکھیں, twice daily" -> preserve the Urdu instruction and the English dosage as spoken.
"""


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


def _strip_markdown_fence(text: str) -> str:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)
    return stripped.strip()


def _guess_audio_mime_type(filename: str, content_type: str | None) -> str:
    if content_type and "/" in content_type:
        return content_type
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    ext_map = {
        "webm": "audio/webm",
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "m4a": "audio/m4a",
        "ogg": "audio/ogg",
        "flac": "audio/flac",
        "mp4": "audio/mp4",
    }
    guessed = ext_map.get(ext)
    if guessed:
        return guessed
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type or "application/octet-stream"


def _extract_gemini_text(payload: dict[str, Any]) -> str:
    for candidate in payload.get("candidates") or []:
        content = candidate.get("content") or {}
        for part in content.get("parts") or []:
            text = part.get("text")
            if text:
                return str(text)
    prompt_feedback = payload.get("promptFeedback")
    raise RuntimeError(f"Gemini returned no text content. Feedback: {prompt_feedback!r}")


def _build_gemini_request(model: str, api_key: str) -> tuple[str, dict[str, str]]:
    """Build the Gemini generateContent URL and headers.

    The API key is passed via the ``x-goog-api-key`` header, never in the URL
    query string, so it does not leak into logs/proxies/error bodies.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": api_key,
    }
    return url, headers


async def _gemini_transcribe_and_cleanup(
    audio_bytes: bytes,
    filename: str,
    content_type: str | None,
) -> tuple[str, str, str | None]:
    settings = get_settings()
    if not settings.GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY is not configured.")

    mime_type = _guess_audio_mime_type(filename, content_type)
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": GEMINI_TRANSCRIPTION_PROMPT},
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": base64.b64encode(audio_bytes).decode("ascii"),
                        }
                    },
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "topP": 0.1,
            "responseMimeType": "application/json",
        },
    }

    models = [settings.GEMINI_MODEL]
    if settings.GEMINI_FALLBACK_MODEL:
        models.append(settings.GEMINI_FALLBACK_MODEL)

    last_exc: Exception | None = None
    r: httpx.Response | None = None
    async with httpx.AsyncClient(timeout=300.0) as client:
        for model in dict.fromkeys(models):
            url, headers = _build_gemini_request(model, settings.GOOGLE_API_KEY)
            try:
                r = await _http_post_with_retries(
                    client,
                    "POST",
                    url,
                    headers=headers,
                    json=body,
                    max_attempts=2,
                )
                break
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                status = exc.response.status_code if exc.response is not None else None
                logger.warning("Gemini model %s failed with status %s", model, status)
                if status not in {429, 500, 502, 503, 504}:
                    raise
            except httpx.HTTPError as exc:
                last_exc = exc
                logger.warning("Gemini model %s failed after retries: %s", model, exc)
        else:
            if last_exc:
                raise last_exc
            raise RuntimeError("Gemini transcription failed before a response was received.")

    text = _extract_gemini_text(r.json())
    parsed = json.loads(_strip_markdown_fence(text))

    raw = str(parsed.get("raw_transcript") or "").strip()
    cleaned = str(parsed.get("cleaned_transcript") or "").strip()
    lang = parsed.get("language_detected")
    lang_text = str(lang).strip() if lang else None

    if not raw and cleaned:
        raw = cleaned
    if not cleaned and raw:
        cleaned = raw
    if not raw and not cleaned:
        raise RuntimeError("Gemini returned empty transcription fields.")

    return raw, cleaned, lang_text


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
        "model": "claude-sonnet-4-6",
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
        if not settings.GOOGLE_API_KEY and (not settings.OPENAI_API_KEY or not settings.ANTHROPIC_API_KEY):
            tr.status = TranscriptionStatus.failed
            tr.raw_transcript = tr.raw_transcript or ""
            tr.cleaned_transcript = (
                "Transcription services are not fully configured. "
                "Set GOOGLE_API_KEY to enable Gemini transcription, or set OPENAI_API_KEY and "
                "ANTHROPIC_API_KEY to use Whisper + Claude cleanup."
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

        if settings.GOOGLE_API_KEY:
            raw, cleaned, lang = await _gemini_transcribe_and_cleanup(audio_bytes, filename, None)
        else:
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
        status_code = exc.response.status_code if exc.response is not None else "unknown"
        logger.error("Transcription HTTP failure (%s): %s", status_code, detail)
        tr.cleaned_transcript = "Transcription failed; see server logs."
    except Exception:  # noqa: BLE001
        tr.status = TranscriptionStatus.failed
        tr.raw_transcript = tr.raw_transcript or ""
        logger.exception("Transcription failure")
        tr.cleaned_transcript = "Transcription failed; see server logs."
    await db.flush()
    await db.refresh(tr)
    return tr


def sections_json(cleaned: str | None) -> str:
    return json.dumps(parse_sections(cleaned))
