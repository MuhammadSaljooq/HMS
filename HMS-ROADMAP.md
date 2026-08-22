# National Eye Care HMS — Product Roadmap

> Goal: grow our HMS to the **domain depth** of a mature vertical practice‑management suite
> (benchmarked against CounselEAR — see `counselear-analysis.md`), **adapted to an
> ophthalmology / optometry eye clinic**, while keeping our modern stack (FastAPI +
> Next 14) and *improving* on their security debt (they run legacy WebForms/jQuery 1.7 /
> Telerik 2014 / IE9 / no CSP / no MFA — we won't copy that).

We follow their **feature roadmap**, not their **architecture**.

---

## 0. Where we are today (baseline)

**Backend (FastAPI, async SQLAlchemy 2, Postgres, Redis, Celery):**
- Patients; Appointments (`scheduled/completed/cancelled/no_show`); Medical Records + Vitals + **medication** Prescriptions.
- Transcriber (Gemini / Whisper+Claude, review→approve→link to record; Celery async).
- Billing: `ServiceCatalog`, `Invoice` (subtotal/discount/tax/total/paid/balance, void), `InvoiceLineItem`, `Payment` (payment/refund, methods, receipts); Asia/Karachi reconciliation reports.
- Auth: JWT cookies, refresh rotation + Redis denylist; **RBAC** (admin/doctor/nurse/receptionist/cashier, admin=superuser); `authorization_service` predicates.
- Cross‑cutting: append‑only `audit_logs`, `SoftDeleteMixin`, storage service, dashboard.

**Frontend (Next 14):** dashboard (+ new header), patients, appointments, records, transcriber, billing, settings (user admin), and honest "coming soon" stubs for room / medicine / inventory / analytics.

---

## 1. Gap analysis — CounselEAR module → our HMS (eye‑care adapted)

| CounselEAR area | Our status | Eye‑care adaptation & gap |
|---|---|---|
| Patients / Search | ✅ have | Add full‑text search, patient tags, documents, insurance on file |
| Scheduling (types, rooms, options) | ⚠️ basic appts | Appointment **types**, **rooms/resources**, provider availability, recurring, waitlist, reminders |
| Leads / Opportunities / TNT recall | ❌ none | Leads/CRM, referral sources, recall lists (annual exam, "prescribed‑not‑purchased") |
| Report writing (visit → report queues) | ⚠️ transcriber only | Structured **eye exam**, exam templates, AI‑drafted note from transcript, sign/lock, patient + referral letters (PDF) |
| Devices / hearing‑aid catalog & stock | ❌ none | **Optical dispensary**: frames / lenses / contact‑lens catalog + inventory + lab orders |
| Audiometers / transducers / OAE / word lists | n/a | Eye equivalents: **visual acuity, refraction, IOP/tonometry, keratometry**, slit‑lamp/fundus templates |
| Invoices / line items / bundles / tax / discounts | ✅ core | Add product **types/bundles**, **tax‑rate** & **discount‑type** entities, invoice statuses config, statements |
| **Insurance claims / remittance / A‑R aging / adjustments** | ❌ none | Payers, patient policies, superbills (CPT+ICD), claims, ERA posting, A/R aging — *the biggest gap* |
| Payments / CounselEAR Pay | ✅ manual | Add **gateway** (Stripe) card capture + reconciliation |
| Commission tracker | ❌ none | Optometrist/optician sales commission |
| Reports (detail + summary + analytics) | ⚠️ dashboard only | Generic report generator + summary/analytics suite (CSV/PDF export) |
| Admin config (clinics, regions, roles, reference data) | ⚠️ users only | Multi‑clinic/region, **granular permissions**, reference‑data admin console |
| Comms (Twilio SMS, Freshchat, support tickets) | ❌ none | SMS/email notifications, patient messaging, support tickets |
| AI (AI Templates, Insight, "Linea AI") | ⚠️ transcriber | AI exam‑note drafting, coding suggestions, no‑show risk, recall targeting |
| Integrations (ModMed, Phonak) | ❌ none | Future: lab/optical‑lab, FHIR/HL7 interop groundwork |

---

## 2. Phased roadmap

Each phase is independently shippable (own spec → plan → build → verify → PR/merge). Ordered by clinical value + dependency.

### Phase 1 — Eye‑care clinical core *(the differentiator)*
**Models:** `EyeExam` (per‑eye OD/OS): visual acuity (distance/near, cc/sc, pinhole), **refraction** (sphere/cyl/axis/add/PD/prism), **IOP** (method + mmHg + time), keratometry, lensometry; `ExamComponent` free‑form findings (slit‑lamp, fundus, external); `Diagnosis` (ICD‑10, laterality); `Procedure` (CPT).
**Prescriptions:** split into `SpectacleRx` (OD/OS sphere/cyl/axis/add/PD/prism, lens type) and `ContactLensRx` (brand/BC/DIA/power), keeping the existing `MedicationPrescription`.
**Workflow:** visit states + queues — **incomplete visits**, **unsigned notes**, **unsent reports** (CounselEAR's report‑writing queues); sign/lock a finalized note (immutable + audit).
**AI tie‑in:** approved transcript → AI‑drafted exam note (Claude) → clinician review/edit → sign.
**Output:** patient report + referral letter PDF; send via email/portal.

### Phase 2 — Revenue cycle & insurance *(CounselEAR's deepest surface)*
**Config entities:** `TaxRate`, `AdjustmentType` (discounts/write‑offs), `InvoiceStatus` config, `ProductType`, `ProductBundle`, `PaymentMethodSubtype`.
**Insurance:** `Payer`, `PayerType`, `PatientInsurancePolicy` (primary/secondary, member/group), eligibility notes.
**Claims:** `Superbill` (auto CPT+ICD from the visit), `Claim` (+status lifecycle), submission adapter (clearinghouse‑ready stub), **ERA/remittance** posting, **provider adjustments**, **A/R aging** report.
**Patient billing:** statements, running balances, `Commission` tracking.
**Payments:** Stripe gateway integration (card capture, webhook reconciliation) as the "CounselEAR Pay" analog.

### Phase 3 — Optical dispensary & inventory *(turns the stub pages real)*
`Product` (frames / lenses / contact lenses; SKU, brand, attributes), `StockItem`/levels per clinic, `PurchaseType`, `ProductTag`, `SupplierOrder`/`LabOrder` (Rx → lab → dispense), trial/loaner lenses, low‑stock alerts, stock + sales‑by‑product reports. Replaces "coming soon" inventory/medicine.

### Phase 4 — Scheduling, recall & CRM/growth
Appointment **types**, **rooms/resources**, provider availability & templates, recurring, waitlist, overbook rules; **reminders** (SMS/email) + **recall** (annual exam, prescribed‑not‑purchased); `Lead`/`Opportunity` pipeline, referral sources, conversion & campaign tracking; two‑way patient SMS (Twilio).

### Phase 5 — Reporting & analytics suite
Generic **report generator** (filterable detail reports per entity, CSV/PDF export), **summary/analytics** (production by provider, sales analytics, appointment life‑cycle, A/R aging, referral ROI, recall effectiveness), and a **configurable widget dashboard** (mirror CounselEAR's widget pattern — but persist filters in a `user_dashboard_pref` table, not cookie sprawl).

### Phase 6 — Platform, multi‑clinic & admin
**Multi‑clinic / multi‑region tenancy** (scope every clinical/financial table by `clinic_id`; RBAC per clinic); **granular permissions** (role→permission matrix editor, beyond the fixed 5 roles — CounselEAR's "User Roles"); clinic & patient **documents**, **e‑signature** capture (consents) as a jSignature analog; reference‑data admin console.

---

## 3. Cross‑cutting platform upgrades (run alongside; some are prerequisites)

**Security (beat CounselEAR here):**
- **MFA/2FA** (TOTP) for staff — they don't have it.
- **Field‑level encryption‑at‑rest** for PHI columns (KMS/envelope).
- **CSP** + full security‑header set, **rate limiting**, brute‑force lockout, tightened session/idle timeout, break‑glass audit events.

**Services & infra:**
- **Notification service** (email + SMS) on Celery (reminders, statements, report delivery).
- **Object storage (S3)** for PDFs, scans, signatures.
- **PDF generation** service (reports, statements, Rx, superbills).
- **Full‑text patient search** (Postgres `tsvector`/trigram).
- **Observability**: structured logs, Sentry, Celery/job monitoring; CI depth.
- **FHIR‑aligned** core resources (Patient / Encounter / Observation / Coverage) for future interop (labs, optical labs, HL7/FHIR) — the eye‑care analog of their ModMed/Phonak integrations.

**Data‑model hygiene:** every new clinical/financial entity gets `SoftDeleteMixin` + audit; money stays `Numeric(12,2)`→JSON string; services flush, routers commit; migrations stay linear.

---

## 4. Suggested build order (dependency‑aware)

1. **Phase 1 (clinical core)** + security prereqs (MFA, encryption groundwork) — highest clinical value, unblocks reports & superbills.
2. **Phase 2 (revenue cycle/insurance)** — depends on Phase 1 coding (CPT/ICD) + billing config.
3. **Phase 3 (optical/inventory)** — depends on product/catalog from Phase 2.
4. **Phase 4 (scheduling/recall/CRM)** + notification service.
5. **Phase 5 (reporting/analytics)** — depends on data from 1–4.
6. **Phase 6 (multi‑clinic/permissions/admin)** — cross‑cutting; do the `clinic_id` foundation *early* if multi‑clinic is a near‑term need, else defer.

Each phase → its own spec in `docs/superpowers/specs/`, plan in `docs/superpowers/plans/`, built on a feature branch → PR → merge, with backend `pytest` + frontend `typecheck/lint/build` green before merge.

---

## 5. Explicit non‑goals / "don't copy" list
- Their legacy front end (WebForms/ViewState/jQuery 1.7/Telerik 2014/IE9).
- Cookie‑sprawl for UI state.
- Audiology‑only modules (audiometers, OAE, word lists) — replaced by eye‑care equivalents.
- Their missing CSP/MFA — we add both.
