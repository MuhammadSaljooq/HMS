# Workstream C — Transcriber Upgrade: Design Spec

**Date:** 2026-08-08
**Target:** production clinic. Doubles as implementation guide. Grounded in the 2026-08-07 transcriber audit + the HIPAA/vendor research report.

## Goal
Make the AI transcriber safer and clinically usable: a review/edit/approve workflow before a transcription is attached to a medical record, plus PHI/security hardening of the LLM calls. Do this without breaking the existing transcribe→attach flow.

## In scope (code-implementable + verifiable now)

### C1 — Review / edit / approve workflow (medico-legal gate)
- Extend `TranscriptionStatus` with `reviewed` and `approved` (keep pending/processing/completed/failed).
- Add columns `reviewed_at`/`reviewed_by`, `approved_at`/`approved_by` (nullable) + `edited: bool default false` to `transcriptions` (migration 0007).
- `PATCH /transcriptions/{id}` (admin/doctor with access): edit `cleaned_transcript`; sets `edited=true`, status→`reviewed`; audited (`transcription.edit`).
- `POST /transcriptions/{id}/approve` (admin/doctor with access): status→`approved`, `approved_at/by` set; audited (`transcription.approve`).
- **Gate:** `PATCH /transcriptions/{id}/link` requires the transcription to be `approved` (or `reviewed`+approved) — reject linking an unreviewed transcript with 400. The frontend attach flow is updated to edit→approve→attach so this doesn't break (C-M2).

### C2 — PHI / security hardening of LLM calls (`transcription_service.py`)
- Move the Gemini API key from the URL query string (`?key=...`) into the `x-goog-api-key` request header.
- Stop persisting/returning upstream error bodies in `cleaned_transcript`: on failure, `logger` the detail server-side but store/return a generic message (`"Transcription failed; see logs."`). No provider internals in PHI fields or client responses.
- Update the Claude cleanup model id from the deprecated dated snapshot `claude-sonnet-4-20250514` to **`claude-sonnet-4-6`** (current-generation Sonnet; good for high-volume clinical cleanup).

### C-M2 — Frontend review UI
- `AttachToRecordDialog`/transcriber page: render the cleaned transcript in an editable textarea; add **Save edits** (PATCH) and **Approve & attach** (approve → link) actions; disable attach until approved. Use `getApiErrorMessage`.

## Out of scope (deferred — infrastructure/vendor, cannot be completed locally; documented follow-ups)
- **Full-async pipeline** (remove inline sync processing; always enqueue Celery; retire duplicate `/transcriptions/upload`): needs a running worker + a frontend polling change; deferred to avoid breaking the current sync UX without infra.
- **Speaker diarization** (doctor vs patient): needs pyannote+GPU or a BAA vendor (Deepgram) — infra/vendor.
- **HIPAA vendor compliance:** move Gemini to **Vertex AI** (the AI Studio key endpoint is NOT BAA-covered), OpenAI ZDR endpoints, Claude via Bedrock/Vertex or direct API BAA — needs cloud creds + signed BAAs.
- **Structured SOAP via strict JSON schema** and **chunking long consultations**: coupled to the provider migration; deferred.
- Audio **encryption at rest** / retention job: shares Workstream B's deferred encryption item (infra).

## Migration
`0007_transcription_review` (0006 → 0007): add the review/approve columns + `edited`; add the two enum values `reviewed`,`approved` to `transcription_status` (non-transactional `ADD VALUE` in its own step, like 0003).

## Verification
- Backend suite green + new tests: edit sets edited/reviewed + audit; approve sets approved + audit; link rejected (400) unless approved, succeeds after approve.
- Gemini request built with header (unit assert, no live call); failure path stores generic message (unit).
- Frontend typecheck + lint + build; transcriber attach flow updated.

## Change log
- 2026-08-08: Initial spec; scope split into code-doable (ship now) vs infra/vendor (deferred).
