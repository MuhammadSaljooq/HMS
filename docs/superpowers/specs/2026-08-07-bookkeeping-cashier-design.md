# Bookkeeping / Cashier Module — Design Spec (Workstream A)

**Date:** 2026-08-07
**Status:** Approved design; ready for implementation planning.
**Target:** Real clinic, production (PHI + financial records; HIPAA + record-retention rigor).
**Approach:** A1 — full invoice model (approved).
**Roadmap:** see `2026-08-07-hms-improvement-roadmap.md`. This workstream includes **Phase 0 shared foundations** because it is the first module to depend on them.

---

## 1. Purpose & scope

Let a **cashier** record patient fees and payments, issue receipts, and produce daily bookkeeping reports. Concretely:

- Maintain a **fee schedule** (priced services the clinic offers).
- Create an **invoice** for a patient (optionally tied to an appointment/encounter), with line items.
- Record **payments** against an invoice (cash/card/transfer/wallet), including **partial payments** and **refunds**, each producing a numbered **receipt**.
- Track invoice **status** (draft → issued → partially_paid → paid; or void) and **outstanding balance**.
- Produce **reports**: daily cash totals by method, per-cashier reconciliation, outstanding balances, revenue by service.

**Out of scope (YAGNI for now):** insurance claims/adjudication, tax filing, multi-currency, general-ledger double-entry accounting, price negotiation workflows. The model leaves room for these but we do not build them.

## 2. Success criteria

- A cashier can, end to end: find a patient → create an invoice with catalog + ad-hoc line items → issue it → record one or more payments → print a receipt → see the balance reach zero and status become `paid`.
- A cashier can run their **daily reconciliation** (what they collected today, by method) and an admin can run it for any cashier.
- Every financial mutation (create/issue/pay/refund/void) writes an **immutable audit-log entry** and records `created_by`/`received_by`.
- Invoices and payments are **never hard-deleted**; corrections happen via **void** (admin) or **refund**.
- Endpoint-level authorization holds: non-cashier/non-admin roles cannot access billing; cashiers cannot void or edit the fee schedule; cashiers see only billing-scoped patient identity, not clinical data.
- Payment math is correct and race-safe under concurrent payments on the same invoice.

## 3. Conventions this follows (verified in repo)

- Models: `Mapped[...]` / `mapped_column`, UUID PKs via `postgresql.UUID(as_uuid=True)` default `uuid.uuid4`, `created_at`/`updated_at` with `server_default=func.now()` + `onupdate`, PG-native `Enum(..., name=...)`, relationships via `back_populates`. (cf. `app/models/patient.py`, `app/models/appointment.py`)
- Enums live in `app/models/enums.py`.
- Schemas in `app/schemas/<name>.py` with `Base`/`Create`/`Update`/`Read`/`ListResponse{items,total}` split and `ConfigDict(from_attributes=True)` on `Read`. (cf. `app/schemas/patient.py`)
- Services in `app/services/<name>_service.py` are async, take `db`, do `flush`+`refresh`, and do **not** commit — routers commit. (cf. `app/services/patient_service.py`, `app/routers/patients.py`)
- Auth deps in `app/utils/deps.py`: `get_current_user`, `require_role(*roles)` — **admin auto-passes every role gate** (`deps.py:75`).
- Routers created with `APIRouter(prefix=..., tags=[...])` and registered in `app/main.py` with `prefix="/api"` (`main.py:63-70`).
- Number generation mirrors `generate_unique_mrn` (`patient_service.py:15-23`): `PREFIX-<year>-<hex>`, retry-on-collision.
- Alembic: enums created with `create_type=False` then `.create(bind, checkfirst=True)`; indexes in a dedicated migration (cf. `0001_initial_schema.py`, `0002_appointment_indexes.py`).
- Frontend: role lists + route rules in `frontend/lib/rbac.ts`; nav in `frontend/lib/navigation.ts`; data access via React Query hooks in `frontend/hooks/queries/`; forms use react-hook-form + zod; errors via `getApiErrorMessage`; role-gated UI via `frontend/components/layout/RoleGuard.tsx`.

---

## 4. Phase 0 — Shared foundations (built as part of this workstream)

### 4.1 `AuditLog` (append-only)
New model `app/models/audit.py`, table `audit_logs`:

| column | type | notes |
|---|---|---|
| `id` | UUID PK | |
| `actor_user_id` | UUID FK → `users.id` `ondelete=RESTRICT` | who performed the action; nullable only for system tasks |
| `action` | String(64) | e.g. `invoice.create`, `payment.record`, `invoice.void` |
| `entity_type` | String(64) | e.g. `invoice`, `payment` |
| `entity_id` | UUID | target row |
| `at` | DateTime(tz) | `server_default=func.now()` |
| `metadata` | JSONB | small, **no PHI beyond identifiers**; e.g. amount, method, status transition |
| `ip` | String(64) | nullable |

Append-only (no update/delete path). Retention ≥ 6 years (enforced operationally). Indexed on `(entity_type, entity_id)` and `(actor_user_id, at)`.

### 4.2 Soft-delete + authorship
- Soft-delete mixin (`deleted_at`, `deleted_by`) — **used by workstream B for clinical tables**; billing uses **void** semantics instead of soft-delete, so billing tables do not get the mixin. It is introduced here so B can reuse it.
- `created_by`/`updated_by` UUID FK → `users.id` `ondelete=RESTRICT` added to billing tables.

### 4.3 Current-actor + audit helper
- Reuse `get_current_user` for actor identity.
- `audit_service.record(db, *, actor, action, entity_type, entity_id, metadata=None, ip=None)` — appends an `AuditLog` row (flush only; router commits in the same transaction as the mutation, so audit + mutation are atomic).

---

## 5. Data model (billing)

Money: **`Numeric(12, 2)`** everywhere (exact; reads naturally in reports). All FKs to `users` use `ondelete=RESTRICT` (never lose the cash trail).

### 5.1 New enums (`app/models/enums.py`)
```
class InvoiceStatus(str, enum.Enum):   # name="invoice_status"
    draft = "draft"; issued = "issued"; partially_paid = "partially_paid"
    paid = "paid"; void = "void"

class PaymentMethod(str, enum.Enum):   # name="payment_method"
    cash="cash"; card="card"; bank_transfer="bank_transfer"
    mobile_wallet="mobile_wallet"; other="other"

class PaymentType(str, enum.Enum):     # name="payment_type"
    payment="payment"; refund="refund"

# UserRole gains: cashier = "cashier"
```

### 5.2 `service_catalog` (fee schedule)
`id`(UUID PK), `code`(String(32) unique index), `name`(String(255)), `description`(Text?), `default_price`(Numeric(12,2), CHECK ≥ 0), `is_active`(bool default true), `created_at`/`updated_at`. Never hard-deleted — deactivate via `is_active`.

### 5.3 `invoices`
`id`(UUID PK), `invoice_number`(String(32) unique index, `INV-<year>-<hex>`), `patient_id`(FK→patients `ondelete=RESTRICT`), `appointment_id`(FK→appointments `ondelete=SET NULL`, nullable), `medical_record_id`(FK→medical_records `ondelete=SET NULL`, nullable), `status`(InvoiceStatus default draft), `subtotal`, `discount_total`(default 0), `tax_total`(default 0), `total_amount`, `amount_paid`(default 0), `balance_due`, `notes`(Text?), `created_by`(FK→users RESTRICT), `issued_at`(tz?), `voided_at`(tz?), `voided_by`(FK→users RESTRICT, nullable), `void_reason`(Text?), `created_at`/`updated_at`.
Denormalized `subtotal/total_amount/amount_paid/balance_due` are recomputed by the service on every line-item/payment change (single source of truth = the rows; denorm is a cache for reporting).

### 5.4 `invoice_line_items`
`id`(UUID PK), `invoice_id`(FK→invoices `ondelete=CASCADE`), `service_id`(FK→service_catalog `ondelete=SET NULL`, nullable → allows ad-hoc lines), `description`(String(255), **snapshot** of service name), `unit_price`(Numeric(12,2), **snapshot**), `quantity`(Integer default 1, CHECK ≥ 1), `line_total`(Numeric(12,2)), `created_at`.
Snapshotting price/description is deliberate: later catalog changes must not rewrite billed history.

### 5.5 `payments`
`id`(UUID PK), `invoice_id`(FK→invoices `ondelete=RESTRICT`), `receipt_number`(String(32) unique index, `RCP-<year>-<hex>`), `payment_type`(PaymentType default payment), `method`(PaymentMethod), `amount`(Numeric(12,2), CHECK > 0 — magnitude; `payment_type` gives direction), `reference`(String(128)?), `received_by`(FK→users RESTRICT), `received_at`(tz default now), `notes`(Text?), `created_at`.

### 5.6 Indexes (own migration)
`ix_invoices_patient_created (patient_id, created_at)`, `ix_invoices_status (status)`, `ix_payments_receivedby_receivedat (received_by, received_at)`, `ix_payments_received_at (received_at)`, `ix_invoice_line_items_service (service_id)`, plus the unique indexes on `invoice_number`, `receipt_number`, `service_catalog.code`.

### 5.7 Relationships & registration
`Invoice.line_items` / `.payments` (`back_populates`, cascade on line_items), `Invoice.patient`, `Invoice.appointment`. Register all new models in `app/models/__init__.py`.

---

## 6. Business rules & payment math

- **State machine:** `draft` → (issue) → `issued` → (payment) → `partially_paid` → (payment) → `paid`. `void` reachable from `draft`/`issued`/`partially_paid` (admin only). Cannot pay a `draft` or `void` invoice. Cannot add/remove line items after `issued`.
- **Totals:** `subtotal = Σ line_total`; `total_amount = subtotal − discount_total + tax_total`; `amount_paid = Σ(payments where type=payment) − Σ(refunds)`; `balance_due = total_amount − amount_paid`.
- **Status derivation after each payment:** `paid` when `balance_due ≤ 0`; `partially_paid` when `0 < amount_paid < total_amount`; guard against overpayment (reject payment that would drive `balance_due` below 0 unless it's an explicit `other` adjustment — default reject).
- **Concurrency:** wrap payment recording in a transaction that `SELECT ... FOR UPDATE` locks the invoice row (mirrors the advisory-lock rigor already in `appointment_service`), so two concurrent payments can't both read a stale `amount_paid`.
- **Refunds:** `payment_type=refund`, positive `amount`, reduces `amount_paid`; may move a `paid` invoice back to `partially_paid`. Cannot refund more than `amount_paid`.
- **Void:** sets `status=void`, `voided_at/by`, `void_reason`; invoice retained; blocks further payments. Admin only.
- **Numbering:** `generate_unique_invoice_number` / `generate_unique_receipt_number` copied from `generate_unique_mrn` pattern.

---

## 7. Roles & authorization

Add `cashier` to `UserRole`. New predicates in `app/services/authorization_service.py`:
```
can_manage_billing(user)      -> role in (admin, cashier)
can_void_invoice(user)        -> role == admin
can_manage_service_catalog(u) -> role == admin
can_view_all_reconciliation(u)-> role == admin      # cashier scoped to received_by == self
```
`require_role(UserRole.admin, UserRole.cashier)` guards billing endpoints (admin auto-passes per `deps.py:75`). **Cashier patient visibility:** a dedicated billing-scoped lookup returning only `id, full_name, mrn` — cashiers do **not** get `ensure_can_view_patient` clinical access (records/vitals/transcriptions).

| Action | cashier | admin | others |
|---|---|---|---|
| Billing-scoped patient lookup | ✅ | ✅ | ❌ |
| Create/issue invoice, line items | ✅ | ✅ | ❌ |
| Record payment / refund / receipt | ✅ | ✅ | ❌ |
| Void invoice | ❌ | ✅ | ❌ |
| Manage fee schedule | ❌ | ✅ | ❌ |
| Own daily reconciliation | ✅ (self) | ✅ (any) | ❌ |
| Outstanding / revenue reports | ❌ | ✅ | ❌ |

---

## 8. API (`app/routers/billing.py`, `prefix="/billing"`, registered in `main.py`)

| Method | Path | Purpose | Authz |
|---|---|---|---|
| GET | `/billing/service-catalog` | List fee schedule | admin, cashier |
| POST | `/billing/service-catalog` | Create service | admin |
| PATCH | `/billing/service-catalog/{id}` | Edit price / deactivate | admin |
| GET | `/billing/patients/lookup?q=` | Billing-scoped patient search (id/name/mrn) | admin, cashier |
| POST | `/billing/invoices` | Create draft (patient + optional appointment) | admin, cashier |
| GET | `/billing/invoices` | List/filter (patient_id, status, date range, cashier) — paginated `{items,total}` | admin, cashier |
| GET | `/billing/invoices/{id}` | Invoice + line items + payments | admin, cashier |
| POST | `/billing/invoices/{id}/line-items` | Add line (catalog or ad-hoc) — draft only | admin, cashier |
| DELETE | `/billing/invoices/{id}/line-items/{itemId}` | Remove line — draft only | admin, cashier |
| POST | `/billing/invoices/{id}/issue` | draft→issued; assign `invoice_number`, `issued_at` | admin, cashier |
| POST | `/billing/invoices/{id}/payments` | Record payment/refund; assign receipt; recompute status | admin, cashier |
| GET | `/billing/invoices/{id}/payments` | Payments for invoice | admin, cashier |
| GET | `/billing/payments/{id}/receipt` | Printable receipt payload | admin, cashier |
| POST | `/billing/invoices/{id}/void` | Void with reason | admin |
| GET | `/billing/patients/{patientId}/invoices` | Patient billing history | admin, cashier |
| GET | `/billing/reports/daily?date=` | Daily totals by method (cashier→self) | admin, cashier |
| GET | `/billing/reports/reconciliation?date=&cashier_id=` | Per-cashier reconciliation | admin (any); cashier→self |
| GET | `/billing/reports/outstanding` | Unpaid/partial balances | admin |
| GET | `/billing/reports/revenue-by-service?from=&to=` | Revenue grouped by service | admin |

Helpers `_get_invoice_or_404`, `_get_service_or_404` (mirror `_get_patient_or_404`). Router commits; services flush+refresh and call `audit_service.record` for each mutation.

Schemas in `app/schemas/billing.py`: `ServiceCatalog{Create,Update,Read}`, `Invoice{Create,Read,ListItem}`, `InvoiceListResponse{items,total}`, `LineItem{Create,Read}`, `Payment{Create,Read}`, report DTOs. Reads use `ConfigDict(from_attributes=True)`.

---

## 9. Frontend (`frontend/app/dashboard/billing/`)

| Route | Page |
|---|---|
| `/dashboard/billing` | Cashier dashboard — today's totals, quick "New Invoice", recent receipts, outstanding count |
| `/dashboard/billing/invoices` | Invoice list/search (status, patient, date) |
| `/dashboard/billing/invoices/new` | Create invoice: patient picker + line-item builder from catalog + ad-hoc |
| `/dashboard/billing/invoices/[id]` | Invoice detail: line items, issue, record payment, print receipt, (admin) void |
| `/dashboard/billing/patients/[patientId]` | Patient billing history |
| `/dashboard/billing/reconciliation` | Daily reconciliation (cashier=self; admin picks cashier/date) |
| `/dashboard/billing/catalog` | Fee-schedule management — `RoleGuard` admin-only |

Wiring:
- `frontend/types/index.ts`: add `"cashier"` to `UserRole`; add `Invoice*`, `Payment*`, `ServiceCatalog*`, `InvoiceListResponse` types mirroring Read schemas.
- `frontend/lib/rbac.ts`: `BILLING_ROLES = ["admin","cashier"]`; `DEFAULT_ROLE_HOME_PATHS.cashier = "/dashboard/billing"`; add `/dashboard/billing*` route rules (admin still auto-passes via `hasRequiredRole`).
- `frontend/lib/navigation.ts`: add `{ href:"/dashboard/billing", label:"Billing", icon: Receipt, roles: BILLING_ROLES }`.
- `frontend/hooks/queries/`: `useServiceCatalogQuery`, `useInvoiceListQuery`, `useInvoiceDetailQuery`, `useDailyReconciliationQuery`; mutations `useCreateInvoiceMutation`, `useAddLineItemMutation`, `useIssueInvoiceMutation`, `useRecordPaymentMutation`, `useVoidInvoiceMutation` (invalidate `["invoice-detail",id]`, `["invoice-list"]`, `["billing-daily"]`). All errors via `getApiErrorMessage`; loading/empty/error states required (match existing pages).
- `frontend/middleware.ts`: no change (reads role generically; rbac rules do the gating).

---

## 10. Migrations

Three sequential Alembic revisions:
1. `0003_add_cashier_role` — `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cashier'`. **Must run non-transactionally** (`ADD VALUE` can't run inside a txn on older PG) — its own migration file. `downgrade` = documented no-op (PG can't drop enum values).
2. `0004_billing_and_audit_tables` — create `invoice_status`/`payment_method`/`payment_type` enums (`create_type=False` + `.create(bind, checkfirst=True)`); create `audit_logs`, `service_catalog`, `invoices`, `invoice_line_items`, `payments`; add `created_by`/`updated_by` where specified. `downgrade` drops tables then enums.
3. `0005_billing_indexes` — the indexes in §5.6.

Seed helpers (reuse `app/utils/create_admin.py` style): a `create_cashier` utility and an optional `seed_service_catalog` with a few starter services (e.g. `CONSULT-OPD`, `LAB-BASIC`).

---

## 11. Testing (mirror `backend/tests/`)

- **Payment math** unit tests: totals, partial payment → status transitions, refund, overpayment rejection.
- **Concurrency:** two concurrent payments on one invoice don't double-count (row lock).
- **Authorization/IDOR** integration tests: non-billing roles get 403; cashier cannot void or edit catalog; cashier reconciliation scoped to self; cashier cannot reach clinical patient data via billing lookup.
- **Numbering** uniqueness under collision.
- **Audit:** each mutation writes exactly one `AuditLog` row atomically with the mutation.
- Frontend smoke tests in `frontend/tests/` for the new hooks/pages per existing style.

---

## 12. Build order & sizing

| # | Piece | Size |
|---|---|---|
| 1 | Phase 0: enums + `cashier` role, migration 0003 | S |
| 2 | Phase 0: `AuditLog` model + `audit_service` + soft-delete mixin | M |
| 3 | Billing models + migrations 0004/0005 | M |
| 4 | `app/schemas/billing.py` | S |
| 5 | `authorization_service` predicates | S |
| 6 | `billing_service.py` (numbering, totals, payment/refund/void, row-lock) | L |
| 7 | `routers/billing.py` + register in `main.py` + audit wiring | M |
| 8 | Reports service + endpoints | M |
| 9 | Backend tests | M |
| 10 | Frontend: types + rbac/navigation wiring | S |
| 11 | Frontend: React Query hooks | M |
| 12 | Frontend: pages (dashboard, list/new/detail, payment, receipt) | L |
| 13 | Frontend: reports (reconciliation, outstanding, revenue, catalog admin) | M |

**Order:** 1 → 2 → 3 → 4/5 (parallel) → 6 → 7 → 8 → 9 (backend done & tested) → 10 → 11 → 12 → 13. Ship backend+tests as PR 1, frontend as PR 2. Overall: backend ~L, frontend ~L.

---

## 13. Decisions locked
- Money: `Numeric(12,2)`.
- Void authority: admin only.
- Line-item prices snapshotted; invoices/payments never hard-deleted (void/refund instead).
- Cashier gets billing-scoped patient identity only, not clinical data.
- Phase 0 audit-log + soft-delete foundation lands in this workstream.

## 14. Open questions (non-blocking; default as noted)
- Discounts/tax: model supports `discount_total`/`tax_total` — do we expose UI for them now or defer? **Default: include discount field in UI, hide tax (set 0) until the clinic confirms tax handling.**
- Receipt printing: server returns a printable payload; do we need a PDF or is a print-styled HTML page enough? **Default: print-styled HTML page (browser print) for v1.**
- Is a cashier allowed to create invoices for any patient, or only patients with a today's appointment? **Default: any patient (billing-scoped lookup).**

## Change log
- 2026-08-07: Initial spec; approach A1 and roadmap approved by owner.
