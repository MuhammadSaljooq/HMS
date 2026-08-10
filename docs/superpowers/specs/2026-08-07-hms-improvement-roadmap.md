# HMS Improvement Roadmap — Master Plan

**Date:** 2026-08-07
**Target context:** Real clinic, **production** — handles actual patient PHI. All plans assume HIPAA-grade rigor.
**Author:** Engineering (with Claude Code)

This document sequences the work surfaced by the 2026-08-07 full-system audit into dependency-ordered workstreams. Each workstream gets its **own** spec → implementation plan → build cycle. This file is the index and the rationale for the ordering; it is **not** an implementation plan.

---

## Background

The system is a Hospital Management System: FastAPI + SQLAlchemy async + Alembic + Postgres + Celery/Redis backend (`backend/`), Next.js 14 App Router + TypeScript + Tailwind + React Query frontend (`frontend/`). A full audit (2026-08-07) found:

- Real, mostly-solid features: patients, appointments, medical records (read), AI transcriber, auth/RBAC, settings.
- Four fully-mock pages presenting fabricated clinical data as real (room, medicine, analitik, inventory).
- No bookkeeping/billing feature at all (a stated business requirement).
- PHI-safety gaps unacceptable for production: hard-delete of patient/clinical records, no audit trail, SQL echo can log PHI, transcriber leaks PHI to non-BAA vendors.

## Guiding principles

1. **Compliance is foundational, not a feature.** Audit logging and non-destructive deletes must exist before we add modules that write clinical/financial records — retrofitting them is expensive and legally risky (audit logs retained ≥ 6 years; medical/financial record retention).
2. **One spec per workstream.** Each is independently reviewable, plannable, and shippable.
3. **Follow existing conventions.** Match the observed patterns (UUID PKs, service-does-flush/router-commits, Alembic enum handling, React Query hooks, centralized `authorization_service`).
4. **YAGNI.** Build what the clinic needs now; design boundaries so later hardening slots in without rework.

---

## Workstream sequence

| Order | Workstream | Spec file | Depends on |
|---|---|---|---|
| 1 | **Phase 0 — Shared foundations** | (folded into A's spec; see below) | — |
| 2 | **A — Bookkeeping / Cashier** | `2026-08-07-bookkeeping-cashier-design.md` | Phase 0 |
| 3 | **B — PHI-safety hardening (remainder)** | _TBD — written after A_ | Phase 0 |
| 4 | **C — Transcriber upgrade** | _TBD — written after B_ | Phase 0, B (encryption) |
| 5 | **D — Replace mock pages + record creation** | _TBD — written after C_ | — |

### Phase 0 — Shared foundations (prerequisite, small)

Landed as part of workstream A's first slice because A is the first module to depend on it:

- `AuditLog` table: `id, actor_user_id, action, entity_type, entity_id, at, metadata(JSONB), ip?`. Append-only. Retained ≥ 6 years.
- Soft-delete mixin: `deleted_at`, `deleted_by`; a query helper/default filter that excludes soft-deleted rows.
- `created_by` / `updated_by` convention on mutable domain tables.
- A request-scoped "current actor" dependency so services can record who did what.

These are defined concretely in the Bookkeeping spec (workstream A) and reused by B, C, D.

### Workstream A — Bookkeeping / Cashier (next: full spec)

New cashier role + invoices/line-items/payments/fee-schedule, receipts, void, and bookkeeping reports (daily totals, per-cashier reconciliation, outstanding balances, revenue by service). Approach **A1 (full invoice model)** approved. Money as `Numeric(12,2)`; void = admin-only; line-item prices snapshotted; invoices never hard-deleted.

### Workstream B — PHI-safety hardening (remainder)

After Phase 0 delivers audit+soft-delete, B covers the rest:

- Apply soft-delete + audit to patients, medical_records, prescriptions (replace hard-delete/cascade).
- Pagination + tighter role scoping on `list_records`, `list_transcriptions`, `list_appointments` (currently unbounded PHI dumps).
- Pin `DEBUG=false` / `APP_ENV=production`; ensure SQL echo off; scrub PHI from logs and error payloads.
- Encryption at rest (S3 SSE-KMS or equivalent; encrypt or remove local upload fallback in prod); TLS 1.2+ enforced.
- User management endpoints (deactivate / reset password / change role — wire the unused `UserUpdate` schema).
- Broaden rate limiting (refresh/register/bootstrap/upload); fix bootstrap race.
- Missing FK indexes + DB-level partial-unique double-booking constraint.
- MFA for staff accounts (per HIPAA 2025–2026 direction); stronger password policy; constant-time login.
- Endpoint-level authorization/IDOR integration tests.

### Workstream C — Transcriber upgrade

Depends on Phase 0 (audit) and B (encryption). Driven by research findings:

- **Compliance:** move off the direct Gemini **AI Studio** key endpoint (NOT HIPAA-covered) to **Vertex AI Gemini** or an alternative under a BAA. If using OpenAI, only **Zero-Data-Retention** endpoints. Claude for note-cleanup via **Bedrock/Vertex or direct Anthropic API BAA**.
- **STT + diarization for Urdu+English:** no managed vendor cleanly does code-switch **with** diarization. Primary recommendation: **self-hosted pyannote.audio (diarization) + fine-tuned Whisper large-v3 (ASR)** — PHI stays in-house, no BAA needed, tunable for Urdu. Managed fallback: **Deepgram Nova-3** (has BAA) — must be piloted on real code-switched clips. Move key off URL query string.
- **Pipeline:** make the whole pipeline async (remove inline sync processing that blocks request workers; retire duplicate `/transcriptions/upload`); stream audio instead of double-reading into memory; server-side duration/format validation (don't trust client `duration_seconds`).
- **Clinical quality:** speaker-labeled transcript (Doctor/Patient); structured SOAP via strict JSON schema (`output_config.format`) instead of brittle regex; models `claude-sonnet-4-6` (routine) / `claude-opus-4-8` (hard cases).
- **Workflow:** editable transcript + explicit review/approve state before it can be attached to a medical record (medico-legal). New `reviewed`/`approved` status + `PATCH` to edit + approval gate on `/link`.
- **Scale:** chunk long consultations; raise the 10-minute client cap; retention/auto-delete for audio + orphaned transcripts.

### Workstream D — Replace mock pages + medical-record creation

Pure product work, no compliance blockers:

- Build real backends + UIs for room management, medicine/pharmacy, analytics, inventory (or gate behind honest "Coming soon" until built). Remove fabricated clinical numbers from dashboard home and doctors-staff.
- Add a **create-medical-record** flow (form + `POST /records`) — currently records are view-only, which dead-ends the transcription-attach flow.
- Fix silent error swallowing (appointment status/notes/cancel, vitals save); standardize on `getApiErrorMessage`; consolidate data-fetching onto React Query; accessibility pass on decorative controls.

---

## HIPAA technical safeguards (applies across B and C)

- AES-256 at rest; TLS 1.2+ (1.3 preferred) in transit.
- Immutable audit logs (who/what/when/action), retained ≥ 6 years, reviewable.
- Unique user IDs, automatic logoff, role-based access, MFA on PHI systems.
- Defined retention & secure disposal (cryptographic erasure).
- BAAs executed with every vendor that processes PHI before go-live.

## Open items to confirm at execution time

- Cloud choice for BAA boundary (AWS Bedrock vs Google Vertex vs direct Anthropic API BAA).
- Whether to self-host STT (GPU ops) or use Deepgram (pilot required).
- Final status of proposed 2025 HIPAA Security Rule amendments (may make encryption/MFA explicitly required).

---

## Change log
- 2026-08-07: Initial roadmap created from full-system audit; sequence and A1 approach approved by owner.
