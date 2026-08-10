# Workstream B — PHI-Safety Hardening: Design Spec

**Date:** 2026-08-08
**Target:** Real clinic, production (PHI). Full HIPAA-grade rigor for code-implementable controls.
**Roadmap:** `2026-08-07-hms-improvement-roadmap.md`. Builds on the audit-log infra shipped in Workstream A (`audit_service.record`, `audit_logs` table).

This spec doubles as the implementation guide. Decisions are locked. Grounded in the 2026-08-08 current-state map (alembic head **0005**).

## Goal

Close the production PHI-safety gaps found in the audit **without changing API response shapes** (to avoid frontend blast radius): non-destructive deletes, audit coverage of mutations, bounded+scoped PHI reads, logging/config lockdown, user management, rate-limiting, auth hardening, and DB integrity — plus endpoint-level authorization tests.

## In scope

### B1 — Soft-delete (non-destructive PHI deletion)
- Add `SoftDeleteMixin` (`deleted_at: datetime|None`, `deleted_by: UUID|None` FK `users.id` RESTRICT) to: `Patient`, `Appointment`, `MedicalRecord`, `Prescription`, `Vitals`, `Transcription`.
- `DELETE /patients/{id}` and `DELETE /records/{id}` no longer hard-delete. They set `deleted_at`/`deleted_by`, and **cascade soft-delete** to children in the service (patient → its appointments, records, prescriptions, vitals, transcriptions; record → its prescriptions, and null-link its transcriptions as today). Each writes an `audit_logs` entry. Still return `204`.
- **All reads exclude soft-deleted rows.** Add a helper (e.g. `not_deleted(model)` returning `model.deleted_at.is_(None)`) applied to: `_get_patient_or_404`, `patient_service.list_patients`, `get_record`/`list_records`, list_appointments, list/patient transcriptions, list_vitals, and any `_get_*_or_404`. A soft-deleted entity returns 404 on GET and never appears in lists.
- Migration adds the two columns to all six tables (nullable) + a partial index `WHERE deleted_at IS NULL` is not required; a plain index on `deleted_at` per table is optional (skip for now).

### B2 — Audit coverage + authorship
- Reuse `audit_service.record`. Write an audit entry for every **mutation**: create/update/soft-delete on patients, medical_records, prescriptions, appointments, vitals, and users (create/role-change/deactivate/password-reset). Action strings like `patient.create`, `record.delete`, `user.update`. Metadata carries identifiers + changed fields (NO clinical free-text / PHI bodies).
- Capture request IP: add `request: Request` to the handlers that audit and pass `request.client.host` as `ip`.
- Add authorship/timestamps: `created_by`/`updated_by` (nullable UUID FK users) to `medical_records` and `prescriptions`; add `created_at` to `prescriptions`. Populate `created_by` on create where an actor exists. (Existing `doctor_id`/`recorded_by` remain.)

### B3 — Bounded + scoped list reads (NO response-shape change)
- `list_records`, `list_transcriptions`, `list_appointments`, `list_patient_transcriptions`, `list_vitals` keep returning **bare arrays** but gain `skip: int = Query(0, ge=0)` and `limit: int = Query(100, ge=1, le=200)` and apply them. This removes unbounded PHI dumps with zero frontend impact.
- Tighten scoping: admin still allowed, but the query is always capped. `list_records`/`list_transcriptions` for admin without a `patient_id`/`medical_record_id` filter are capped at `limit` (no full-table dump).

### B4 — Config / logging lockdown
- Decouple SQL echo from DEBUG: add `SQL_ECHO: bool = False` to settings; `database.py` uses `echo=settings.SQL_ECHO`.
- Extend `validate_security_defaults`: when `APP_ENV in {staging, production}`, also require `DEBUG is False` and `SQL_ECHO is False` (raise otherwise).
- `render.yaml`: set `APP_ENV=production` and `DEBUG=false` (and `SQL_ECHO=false`) so the prod validation actually fires and PHI is never logged.

### B5 — User management (admin) + self password change
New endpoints in `users.py` (admin-only via `require_role(admin)`), wiring the unused `UserUpdate` schema:
- `GET /users` — list users, paginated `{items,total}` (mirror `PatientListResponse` shape; this is a NEW endpoint, no existing consumer, so a wrapper is fine).
- `GET /users/{id}` — get one.
- `PATCH /users/{id}` — update `full_name`/`role`/`is_active`/`password` (hash if provided). Guards: an admin cannot deactivate or demote **themselves**; cannot deactivate/demote the **last active admin**. Audited.
- `POST /auth/change-password` — authenticated self password change (verify current password → set new). Audited, rate-limited.

### B6 — Rate limiting + bootstrap race
- Add `@limiter.limit(...)` to `refresh` (e.g. `20/minute`), `register` (`20/minute`), `bootstrap` (`5/minute`), and `change-password` (`10/minute`).
- Fix bootstrap race: wrap the count-check + insert in a Postgres advisory lock (`pg_advisory_xact_lock(<const>)`) so concurrent bootstraps serialize; keep the `count > 0 → 400` guard inside the lock.

### B7 — Auth hardening
- Constant-time login: in `authenticate_user`, when the user is missing/inactive, still run `verify_password` against a fixed dummy bcrypt hash before returning `None`, removing the timing side-channel. Behavior (returns `None`) unchanged.
- Password policy: `UserCreate`/`UserUpdate`/change-password `password` → `min_length=12` and require at least one letter and one digit (zod-style validator). `LoginRequest` unchanged (min 1). Update seed utility example passwords and any test/user creation that used <12-char passwords.

### B8 — DB integrity (migration)
- Add missing FK indexes: `medical_records.patient_id`, `medical_records.doctor_id`, `medical_records.appointment_id`, `vitals.patient_id`, `vitals.recorded_by`, `transcriptions.medical_record_id`, `prescriptions.medical_record_id`.
- Add a **partial unique index** `uq_appointments_active_slot` on `(doctor_id, scheduled_at) WHERE status = 'scheduled' AND deleted_at IS NULL` to enforce no double-booking at the DB level (belt-and-suspenders with the app advisory lock).
- Add indexes on `audit_logs (entity_type, entity_id)` and `(actor_user_id, at)`.

### B9 — Tests
Add integration tests (using the async harness): soft-delete hides from GET/list and returns 404; delete writes an audit row; list endpoints honor `limit` cap; user-management authz (non-admin 403; self-deactivate blocked; last-admin protection); change-password flow; login still rejects unknown users (behavioral) and an audit/timing note; rate-limit smoke where feasible. Update any existing tests broken by the changes.

## Out of scope (deferred — infrastructure/large, documented follow-ups)
- **Encryption at rest** (S3 SSE-KMS, DB/disk encryption): deployment/infra; add config hooks only.
- **MFA** for staff accounts: sizable feature → its own workstream.
- **BAAs / vendor agreements**: process, not code.
- **Audit-review UI**: later.
- Frontend user-management UI beyond what's trivial: the endpoints ship now; a management screen can be added later (the existing Settings page already creates users).

## Migration
One migration `0006_phi_hardening` (head 0005 → 0006): add soft-delete columns to the six tables; add `created_by`/`updated_by` to medical_records & prescriptions; add `created_at` to prescriptions; add the FK indexes; add the partial unique appointment index; add audit_logs indexes. Downgrade reverses.

## Backwards-compatibility
- **No API response shapes change** (lists stay arrays; deletes stay 204). Frontend untouched.
- Password policy affects only user creation/update, not login → existing accounts unaffected (demo logins keep working).

## Verification
- Full backend suite green (existing + new B tests).
- Manual HTTP: soft-delete a test patient → GET 404, absent from list, row still in DB with `deleted_at` set, audit row written; over-limit list capped; user PATCH role/deactivate with self-guard; change-password; config validation raises when `APP_ENV=production` + `DEBUG=true`.
- App still runs; existing billing + core flows unaffected.

## Change log
- 2026-08-08: Initial spec; scope locked; grounded in current-state map.
