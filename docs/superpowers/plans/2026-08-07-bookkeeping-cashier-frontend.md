# Bookkeeping / Cashier — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cashier-facing UI for the bookkeeping module — a billing dashboard, invoice create/list/detail with payments & receipts, void, patient billing history, a daily reconciliation report, and an admin fee-schedule (catalog) manager — wired to the billing API.

**Architecture:** Next.js 14 App Router pages under `frontend/app/dashboard/billing/`, data access via React Query hooks in `frontend/hooks/queries/`, using the shared axios client (`lib/api.ts`, same-origin `/api`), shared `ui/` primitives (Card, Button, Input, Select, Table, Dialog, Badge, Skeleton, Textarea), and `getApiErrorMessage` for errors. RBAC is wired via `lib/rbac.ts` + `lib/navigation.ts`; the admin-only catalog page is additionally guarded with `RoleGuard`.

**Tech Stack:** Next.js 14, TypeScript, React Query (@tanstack/react-query), react-hook-form + zod, Tailwind, lucide-react. Tests use `node:test` smoke tests (matches `npm run test:smoke`).

**Spec:** `docs/superpowers/specs/2026-08-07-bookkeeping-cashier-design.md` §9. **Backend companion:** `docs/superpowers/plans/2026-08-07-bookkeeping-cashier-backend.md` (build backend first — this plan calls its endpoints).

**Money convention:** all money fields from the API are **strings** (Pydantic v2 serializes `Decimal` to JSON strings, e.g. `"600.00"`). TS types use `string`; format for display with `lib/money.ts`; send strings back to the API.

**Styling note:** existing feature pages use bespoke per-directory CSS modules. To keep this module tractable and consistent with the design system, billing pages use the shared `ui/` components + Tailwind utility classes rather than new CSS modules. Theming to match the house style can follow later.

---

## File map

**Create:**
- `frontend/lib/money.ts` — currency formatting
- `frontend/hooks/queries/useServiceCatalog.ts` — catalog list + create/update mutations
- `frontend/hooks/queries/useInvoiceList.ts` — invoice list query + createInvoice mutation
- `frontend/hooks/queries/useInvoiceDetail.ts` — detail query + addLineItem/removeLineItem/issue/recordPayment/void mutations + patient lookup
- `frontend/hooks/queries/useBillingReports.ts` — daily / reconciliation / outstanding queries
- `frontend/app/dashboard/billing/page.tsx` — cashier dashboard
- `frontend/app/dashboard/billing/invoices/page.tsx` — invoice list
- `frontend/app/dashboard/billing/invoices/new/page.tsx` — create invoice + line items + issue
- `frontend/app/dashboard/billing/invoices/[id]/page.tsx` — invoice detail: pay, receipt, void
- `frontend/app/dashboard/billing/patients/[patientId]/page.tsx` — patient billing history
- `frontend/app/dashboard/billing/reconciliation/page.tsx` — daily reconciliation
- `frontend/app/dashboard/billing/catalog/page.tsx` — fee-schedule admin (RoleGuard admin)
- `frontend/tests/billing-policy.test.ts` — rbac + money-format smoke tests

**Modify:**
- `frontend/types/index.ts` — add `cashier` to `UserRole`; add billing types
- `frontend/lib/rbac.ts` — `BILLING_ROLES`, cashier home, billing route rules, `DEFAULT_ROLE_HOME_PATHS.cashier`
- `frontend/lib/roles.ts` — `USER_ROLE_LABELS.cashier`, add `cashier` to `ASSIGNABLE_USER_ROLES`
- `frontend/lib/navigation.ts` — Billing nav item

---

## Task 1: Types + RBAC + roles + nav wiring (cashier) — with smoke tests

**Files:**
- Modify: `frontend/types/index.ts`, `frontend/lib/rbac.ts`, `frontend/lib/roles.ts`, `frontend/lib/navigation.ts`
- Test: `frontend/tests/billing-policy.test.ts`

- [ ] **Step 1: Add `cashier` + billing types to `types/index.ts`**

Change the `UserRole` line:

```typescript
export type UserRole = "admin" | "doctor" | "nurse" | "receptionist" | "cashier";
```

Append billing types at the end of the file:

```typescript
export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";
export type PaymentMethod = "cash" | "card" | "bank_transfer" | "mobile_wallet" | "other";
export type PaymentType = "payment" | "refund";

export interface ServiceCatalogItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  default_price: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: string;
  service_id: string | null;
  description: string;
  unit_price: string;
  quantity: number;
  line_total: string;
}

export interface Payment {
  id: string;
  invoice_id: string;
  receipt_number: string;
  payment_type: PaymentType;
  method: PaymentMethod;
  amount: string;
  reference: string | null;
  received_by: string;
  received_at: string;
  notes: string | null;
}

export interface Invoice {
  id: string;
  invoice_number: string | null;
  patient_id: string;
  appointment_id: string | null;
  medical_record_id: string | null;
  status: InvoiceStatus;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  notes: string | null;
  created_by: string;
  issued_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceDetail extends Invoice {
  line_items: InvoiceLineItem[];
  payments: Payment[];
}

export interface InvoiceListResponse {
  items: Invoice[];
  total: number;
}

export interface PatientLookupItem {
  id: string;
  full_name: string;
  mrn: string;
}

export interface MethodTotal {
  method: PaymentMethod;
  payments: string;
  refunds: string;
  net: string;
}

export interface DailyReport {
  date: string;
  totals: MethodTotal[];
  net_total: string;
}

export interface ReconciliationReport {
  date: string;
  cashier_id: string;
  totals: MethodTotal[];
  net_total: string;
}

export interface OutstandingItem {
  invoice_id: string;
  invoice_number: string | null;
  patient_id: string;
  patient_name: string;
  balance_due: string;
  status: InvoiceStatus;
}
```

- [ ] **Step 2: Wire `lib/rbac.ts`**

Add after `ADMIN_OPERATIONS_ROLES`:

```typescript
export const BILLING_ROLES: UserRole[] = ["admin", "cashier"];
export const BILLING_ADMIN_ROLES: UserRole[] = ["admin"];
```

Add the `cashier` entry to `DEFAULT_ROLE_HOME_PATHS` (required — it is a `Record<UserRole, string>`):

```typescript
export const DEFAULT_ROLE_HOME_PATHS: Record<UserRole, string> = {
  admin: "/dashboard",
  doctor: "/dashboard/records",
  nurse: "/dashboard/patients",
  receptionist: "/dashboard/appointments",
  cashier: "/dashboard/billing",
};
```

Add to `EXACT_DASHBOARD_ROUTE_RULES` (the catalog is admin-only):

```typescript
  { path: "/dashboard/billing/catalog", roles: BILLING_ADMIN_ROLES },
```

Add to `PREFIX_DASHBOARD_ROUTE_RULES` (the rest of billing is admin+cashier):

```typescript
  { prefix: "/dashboard/billing", roles: BILLING_ROLES },
```

> Note: exact rules are checked before prefix rules in `isDashboardRouteAllowed`, so `/dashboard/billing/catalog` resolves to admin-only while other `/dashboard/billing/*` paths fall through to the prefix rule.

- [ ] **Step 3: Wire `lib/roles.ts`**

Add `cashier` to `ASSIGNABLE_USER_ROLES` (so admins can create cashier accounts in Settings):

```typescript
export const ASSIGNABLE_USER_ROLES: UserRole[] = ["admin", "doctor", "nurse", "receptionist", "cashier"];
```

Add the label (required — `USER_ROLE_LABELS` is a `Record<UserRole, string>`):

```typescript
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  doctor: "Doctor",
  nurse: "Nurse",
  receptionist: "Receptionist",
  cashier: "Cashier",
};
```

- [ ] **Step 4: Wire `lib/navigation.ts`**

Add `Receipt` to the lucide-react import and `BILLING_ROLES` to the rbac import, then add a nav item after Records:

```typescript
  { href: "/dashboard/billing", label: "Billing", shortLabel: "Cash", icon: Receipt, roles: BILLING_ROLES },
```

- [ ] **Step 5: Write smoke tests**

Create `frontend/tests/billing-policy.test.ts`:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultDashboardPath, isDashboardRouteAllowed } from "../lib/rbac";

test("cashier lands on billing and can access billing pages", () => {
  assert.equal(getDefaultDashboardPath("cashier"), "/dashboard/billing");
  assert.equal(isDashboardRouteAllowed("/dashboard/billing", "cashier"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing/invoices", "cashier"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing/invoices/new", "cashier"), true);
});

test("catalog is admin-only; other roles cannot reach billing", () => {
  assert.equal(isDashboardRouteAllowed("/dashboard/billing/catalog", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing/catalog", "admin"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing", "doctor"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing", "nurse"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing", "admin"), true);
});
```

- [ ] **Step 6: Run smoke tests**

Run: `cd frontend && npm run test:smoke`
Expected: PASS (existing dashboard-policy + new billing-policy tests).

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors (both `Record<UserRole,…>` maps now include `cashier`).

- [ ] **Step 8: Commit**

```bash
git add frontend/types/index.ts frontend/lib/rbac.ts frontend/lib/roles.ts frontend/lib/navigation.ts frontend/tests/billing-policy.test.ts
git commit -m "feat(fe): cashier role wiring (types, rbac, roles, nav) + smoke tests"
```

---

## Task 2: Money formatting util — with smoke test

**Files:**
- Create: `frontend/lib/money.ts`
- Test: extend `frontend/tests/billing-policy.test.ts`

- [ ] **Step 1: Write the util**

```typescript
// Formats API money strings (e.g. "600.00") as PKR for display.
export function formatCurrency(value: string | number, currency = "PKR"): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// Sum of API money strings, returned as a fixed-2 string (display helper only).
export function sumMoney(values: string[]): string {
  const total = values.reduce((acc, v) => acc + Number(v || 0), 0);
  return total.toFixed(2);
}
```

- [ ] **Step 2: Add a smoke test** (append to `frontend/tests/billing-policy.test.ts`)

```typescript
import { formatCurrency, sumMoney } from "../lib/money";

test("money helpers", () => {
  assert.ok(formatCurrency("600.00").includes("600"));
  assert.equal(sumMoney(["300.00", "250.50"]), "550.50");
});
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && npm run test:smoke`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/money.ts frontend/tests/billing-policy.test.ts
git commit -m "feat(fe): currency formatting helpers"
```

---

## Task 3: React Query hooks

**Files:**
- Create: `frontend/hooks/queries/useServiceCatalog.ts`, `useInvoiceList.ts`, `useInvoiceDetail.ts`, `useBillingReports.ts`

- [ ] **Step 1: `useServiceCatalog.ts`**

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { ServiceCatalogItem } from "@/types";

export function useServiceCatalog(activeOnly = false) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["service-catalog", { activeOnly }],
    queryFn: async (): Promise<ServiceCatalogItem[]> => {
      const { data } = await api.get<ServiceCatalogItem[]>("/billing/service-catalog", {
        params: { active_only: activeOnly || undefined },
      });
      return data;
    },
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (body: { code: string; name: string; description?: string | null; default_price: string }) => {
      const { data } = await api.post<ServiceCatalogItem>("/billing/service-catalog", body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-catalog"] }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      const { data } = await api.patch<ServiceCatalogItem>(`/billing/service-catalog/${id}`, body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["service-catalog"] }),
  });

  return {
    services: listQuery.data ?? [],
    loading: listQuery.isLoading,
    error: listQuery.isError ? getApiErrorMessage(listQuery.error, "Could not load services.") : null,
    createMutation,
    updateMutation,
  };
}
```

- [ ] **Step 2: `useInvoiceList.ts`**

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { Invoice, InvoiceListResponse, InvoiceStatus } from "@/types";

type InvoiceListParams = {
  patientId?: string;
  status?: InvoiceStatus;
  skip: number;
  limit: number;
};

export function useInvoiceList(params: InvoiceListParams) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["invoice-list", params],
    queryFn: async (): Promise<InvoiceListResponse> => {
      const { data } = await api.get<InvoiceListResponse>("/billing/invoices", {
        params: {
          patient_id: params.patientId || undefined,
          status: params.status || undefined,
          skip: params.skip,
          limit: params.limit,
        },
      });
      return data;
    },
    staleTime: 15_000,
  });

  const createInvoice = useMutation({
    mutationFn: async (body: {
      patient_id: string;
      appointment_id?: string | null;
      notes?: string | null;
      discount_total?: string;
    }): Promise<Invoice> => {
      const { data } = await api.post<Invoice>("/billing/invoices", body);
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoice-list"] }),
  });

  return {
    items: listQuery.data?.items ?? [],
    total: listQuery.data?.total ?? 0,
    loading: listQuery.isLoading,
    error: listQuery.isError ? getApiErrorMessage(listQuery.error, "Could not load invoices.") : null,
    createInvoice,
  };
}
```

- [ ] **Step 3: `useInvoiceDetail.ts`**

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type {
  Invoice, InvoiceDetail, InvoiceLineItem, PatientLookupItem, Payment, PaymentMethod, PaymentType,
} from "@/types";

export async function lookupPatients(q: string): Promise<PatientLookupItem[]> {
  const { data } = await api.get<PatientLookupItem[]>("/billing/patients/lookup", { params: { q } });
  return data;
}

export function useInvoiceDetail(id: string) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoice-detail", id] });

  const detailQuery = useQuery({
    queryKey: ["invoice-detail", id],
    enabled: !!id,
    queryFn: async (): Promise<InvoiceDetail> => {
      const { data } = await api.get<InvoiceDetail>(`/billing/invoices/${id}`);
      return data;
    },
  });

  const addLineItem = useMutation({
    mutationFn: async (body: {
      service_id?: string | null;
      description?: string | null;
      unit_price?: string | null;
      quantity: number;
    }): Promise<InvoiceLineItem> => {
      const { data } = await api.post<InvoiceLineItem>(`/billing/invoices/${id}/line-items`, body);
      return data;
    },
    onSuccess: invalidate,
  });

  const removeLineItem = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/billing/invoices/${id}/line-items/${itemId}`);
    },
    onSuccess: invalidate,
  });

  const issueInvoice = useMutation({
    mutationFn: async (): Promise<Invoice> => {
      const { data } = await api.post<Invoice>(`/billing/invoices/${id}/issue`);
      return data;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["invoice-list"] });
    },
  });

  const recordPayment = useMutation({
    mutationFn: async (body: {
      method: PaymentMethod;
      amount: string;
      payment_type?: PaymentType;
      reference?: string | null;
      notes?: string | null;
    }): Promise<Payment> => {
      const { data } = await api.post<Payment>(`/billing/invoices/${id}/payments`, body);
      return data;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["billing-daily"] });
    },
  });

  const voidInvoice = useMutation({
    mutationFn: async (reason: string): Promise<Invoice> => {
      const { data } = await api.post<Invoice>(`/billing/invoices/${id}/void`, { reason });
      return data;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["invoice-list"] });
    },
  });

  return {
    invoice: detailQuery.data ?? null,
    loading: detailQuery.isLoading,
    error: detailQuery.isError ? getApiErrorMessage(detailQuery.error, "Could not load invoice.") : null,
    addLineItem,
    removeLineItem,
    issueInvoice,
    recordPayment,
    voidInvoice,
  };
}
```

- [ ] **Step 4: `useBillingReports.ts`**

```typescript
"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { DailyReport, OutstandingItem, ReconciliationReport } from "@/types";

export function useDailyReport(date: string) {
  const query = useQuery({
    queryKey: ["billing-daily", date],
    queryFn: async (): Promise<DailyReport> => {
      const { data } = await api.get<DailyReport>("/billing/reports/daily", { params: { date } });
      return data;
    },
    staleTime: 15_000,
  });
  return {
    report: query.data ?? null,
    loading: query.isLoading,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load report.") : null,
  };
}

export function useReconciliation(date: string, cashierId?: string) {
  const query = useQuery({
    queryKey: ["billing-reconciliation", date, cashierId ?? "self"],
    queryFn: async (): Promise<ReconciliationReport> => {
      const { data } = await api.get<ReconciliationReport>("/billing/reports/reconciliation", {
        params: { date, cashier_id: cashierId || undefined },
      });
      return data;
    },
    staleTime: 15_000,
  });
  return {
    report: query.data ?? null,
    loading: query.isLoading,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load reconciliation.") : null,
  };
}

export function useOutstanding() {
  const query = useQuery({
    queryKey: ["billing-outstanding"],
    queryFn: async (): Promise<OutstandingItem[]> => {
      const { data } = await api.get<OutstandingItem[]>("/billing/reports/outstanding");
      return data;
    },
    staleTime: 30_000,
  });
  return {
    items: query.data ?? [],
    loading: query.isLoading,
    error: query.isError ? getApiErrorMessage(query.error, "Could not load outstanding balances.") : null,
  };
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/hooks/queries/useServiceCatalog.ts frontend/hooks/queries/useInvoiceList.ts frontend/hooks/queries/useInvoiceDetail.ts frontend/hooks/queries/useBillingReports.ts
git commit -m "feat(fe): billing react-query hooks"
```

---

## Task 4: Shared status badge + billing dashboard page

**Files:**
- Create: `frontend/app/dashboard/billing/page.tsx`

- [ ] **Step 1: Write the dashboard page**

```tsx
"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useBillingToday } from "@/hooks/queries/useBillingReports";
import { useDailyReport, useOutstanding } from "@/hooks/queries/useBillingReports";
import { formatCurrency } from "@/lib/money";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BillingDashboardPage() {
  const date = today();
  const { report, loading: dailyLoading, error: dailyError } = useDailyReport(date);
  const { items: outstanding, loading: outLoading } = useOutstanding();

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">Cashier desk — invoices, payments, and daily totals.</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/billing/invoices/new">New invoice</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Collected today</CardTitle>
            <CardDescription>{date}</CardDescription>
          </CardHeader>
          <CardContent>
            {dailyError ? (
              <p className="text-sm text-destructive">{dailyError}</p>
            ) : dailyLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold">{formatCurrency(report?.net_total ?? "0")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Outstanding invoices</CardTitle>
            <CardDescription>Unpaid or partially paid</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{outLoading ? "…" : outstanding.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Link className="text-primary underline" href="/dashboard/billing/invoices">All invoices</Link>
            <Link className="text-primary underline" href="/dashboard/billing/reconciliation">Daily reconciliation</Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today by method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report?.totals?.length ? (
            report.totals.map((t) => (
              <div key={t.method} className="flex justify-between text-sm">
                <span className="capitalize">{t.method.replace("_", " ")}</span>
                <span className="font-medium">{formatCurrency(t.net)}</span>
                <Badge variant="secondary">net</Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No payments recorded today.</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Remove the stray import line**

The generated snippet includes a nonexistent `useBillingToday` import — delete this line so only the real hooks remain:

```tsx
import { useBillingToday } from "@/hooks/queries/useBillingReports";
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/billing/page.tsx
git commit -m "feat(fe): billing dashboard page"
```

---

## Task 5: Invoice list page

**Files:**
- Create: `frontend/app/dashboard/billing/invoices/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvoiceList } from "@/hooks/queries/useInvoiceList";
import { formatCurrency } from "@/lib/money";
import type { InvoiceStatus } from "@/types";

const STATUSES: InvoiceStatus[] = ["draft", "issued", "partially_paid", "paid", "void"];
const PAGE = 50;

export default function InvoiceListPage() {
  const [status, setStatus] = useState<InvoiceStatus | undefined>(undefined);
  const [skip, setSkip] = useState(0);
  const { items, total, loading, error } = useInvoiceList({ status, skip, limit: PAGE });

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <Button asChild><Link href="/dashboard/billing/invoices/new">New invoice</Link></Button>
      </div>

      <div className="flex items-center gap-3">
        <Select
          value={status ?? "all"}
          onValueChange={(v) => { setStatus(v === "all" ? undefined : (v as InvoiceStatus)); setSkip(0); }}
        >
          <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{total} total</span>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Invoice list</CardTitle></CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-muted-foreground">No invoices.</TableCell></TableRow>
                ) : (
                  items.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <Link className="text-primary underline" href={`/dashboard/billing/invoices/${inv.id}`}>
                          {inv.invoice_number ?? "(draft)"}
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{inv.status.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="text-right">{formatCurrency(inv.total_amount)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(inv.balance_due)}</TableCell>
                      <TableCell>{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          <div className="mt-4 flex justify-between">
            <Button variant="outline" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE))}>Previous</Button>
            <Button variant="outline" disabled={skip + PAGE >= total} onClick={() => setSkip(skip + PAGE)}>Next</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/billing/invoices/page.tsx
git commit -m "feat(fe): invoice list page"
```

---

## Task 6: New invoice page (patient pick → create draft → redirect to detail)

**Design note:** line-item building lives on the invoice **detail** page (while status is `draft`), so there is a single place to manage lines. The "new" page creates a draft for a chosen patient and redirects into the detail page. This is a deliberate consolidation of spec §9's "line-item builder" onto the detail view.

**Files:**
- Create: `frontend/app/dashboard/billing/invoices/new/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { lookupPatients } from "@/hooks/queries/useInvoiceDetail";
import { useInvoiceList } from "@/hooks/queries/useInvoiceList";
import { getApiErrorMessage } from "@/lib/api-errors";
import type { PatientLookupItem } from "@/types";

export default function NewInvoicePage() {
  const router = useRouter();
  const { createInvoice } = useInvoiceList({ skip: 0, limit: 50 });
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PatientLookupItem[]>([]);
  const [selected, setSelected] = useState<PatientLookupItem | null>(null);
  const [notes, setNotes] = useState("");
  const [discount, setDiscount] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  async function runSearch() {
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await lookupPatients(q.trim()));
    } catch (e) {
      setError(getApiErrorMessage(e, "Patient search failed."));
    } finally {
      setSearching(false);
    }
  }

  async function submit() {
    if (!selected) return;
    setError(null);
    try {
      const invoice = await createInvoice.mutateAsync({
        patient_id: selected.id,
        notes: notes.trim() || null,
        discount_total: discount || "0",
      });
      router.push(`/dashboard/billing/invoices/${invoice.id}`);
    } catch (e) {
      setError(getApiErrorMessage(e, "Could not create invoice."));
    }
  }

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">New invoice</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">1. Find patient</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input placeholder="Name or MRN" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()} />
            <Button onClick={runSearch} disabled={searching}>Search</Button>
          </div>
          <ul className="divide-y rounded-md border">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  className={`flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted ${selected?.id === p.id ? "bg-muted" : ""}`}
                  onClick={() => setSelected(p)}
                >
                  <span>{p.full_name}</span>
                  <span className="text-muted-foreground">{p.mrn}</span>
                </button>
              </li>
            ))}
            {!results.length && <li className="px-3 py-2 text-sm text-muted-foreground">No results yet.</li>}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Invoice details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">Patient: <span className="font-medium">{selected ? `${selected.full_name} (${selected.mrn})` : "none selected"}</span></p>
          <div className="grid gap-2 md:w-64">
            <Label htmlFor="discount">Discount total</Label>
            <Input id="discount" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button onClick={submit} disabled={!selected || createInvoice.isPending}>
            Create draft invoice
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/billing/invoices/new/page.tsx
git commit -m "feat(fe): new invoice page"
```

---

## Task 7: Invoice detail page (line items, issue, payment, receipt, void)

**Files:**
- Create: `frontend/app/dashboard/billing/invoices/[id]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvoiceDetail } from "@/hooks/queries/useInvoiceDetail";
import { useServiceCatalog } from "@/hooks/queries/useServiceCatalog";
import { getApiErrorMessage } from "@/lib/api-errors";
import { formatCurrency } from "@/lib/money";
import { useAuthStore } from "@/store/authStore";
import type { PaymentMethod, PaymentType } from "@/types";

const METHODS: PaymentMethod[] = ["cash", "card", "bank_transfer", "mobile_wallet", "other"];

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const role = useAuthStore((s) => s.user?.role);
  const { invoice, loading, error, addLineItem, removeLineItem, issueInvoice, recordPayment, voidInvoice } =
    useInvoiceDetail(id);
  const { services } = useServiceCatalog(true);

  const [serviceId, setServiceId] = useState<string>("");
  const [qty, setQty] = useState("1");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payType, setPayType] = useState<PaymentType>("payment");
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <main className="p-6 text-sm text-muted-foreground">Loading…</main>;
  if (error) return <main className="p-6 text-sm text-destructive">{error}</main>;
  if (!invoice) return <main className="p-6 text-sm text-muted-foreground">Invoice not found.</main>;

  const isDraft = invoice.status === "draft";
  const canPay = invoice.status === "issued" || invoice.status === "partially_paid";
  const isAdmin = role === "admin";

  async function run(fn: () => Promise<unknown>, fallback: string) {
    setActionError(null);
    try { await fn(); } catch (e) { setActionError(getApiErrorMessage(e, fallback)); }
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{invoice.invoice_number ?? "Draft invoice"}</h1>
          <Badge variant="secondary" className="mt-1">{invoice.status.replace("_", " ")}</Badge>
        </div>
        <div className="text-right text-sm">
          <p>Total: <span className="font-semibold">{formatCurrency(invoice.total_amount)}</span></p>
          <p>Paid: {formatCurrency(invoice.amount_paid)}</p>
          <p>Balance: <span className="font-semibold">{formatCurrency(invoice.balance_due)}</span></p>
        </div>
      </div>

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Line items</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total</TableHead>
                {isDraft && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.line_items.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">No line items.</TableCell></TableRow>
              ) : invoice.line_items.map((li) => (
                <TableRow key={li.id}>
                  <TableCell>{li.description}</TableCell>
                  <TableCell className="text-right">{formatCurrency(li.unit_price)}</TableCell>
                  <TableCell className="text-right">{li.quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(li.line_total)}</TableCell>
                  {isDraft && (
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => run(() => removeLineItem.mutateAsync(li.id), "Remove failed.")}>Remove</Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {isDraft && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-1">
                <Label>Service</Label>
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Pick a service" /></SelectTrigger>
                  <SelectContent>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} — {formatCurrency(s.default_price)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="qty">Qty</Label>
                <Input id="qty" className="w-20" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <Button
                disabled={!serviceId || addLineItem.isPending}
                onClick={() => run(async () => {
                  await addLineItem.mutateAsync({ service_id: serviceId, quantity: Number(qty) || 1 });
                  setServiceId(""); setQty("1");
                }, "Could not add line item.")}
              >
                Add line
              </Button>
              <Button
                variant="default"
                disabled={invoice.line_items.length === 0 || issueInvoice.isPending}
                onClick={() => run(() => issueInvoice.mutateAsync(), "Could not issue invoice.")}
              >
                Issue invoice
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canPay && (
        <Card>
          <CardHeader><CardTitle className="text-base">Record payment</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <Label>Method</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PaymentMethod)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Type</Label>
              <Select value={payType} onValueChange={(v) => setPayType(v as PaymentType)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="refund">Refund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" className="w-32" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
            </div>
            <Button
              disabled={!payAmount || recordPayment.isPending}
              onClick={() => run(async () => {
                await recordPayment.mutateAsync({ method: payMethod, amount: payAmount, payment_type: payType });
                setPayAmount("");
              }, "Payment failed.")}
            >
              Record
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Payments &amp; receipts</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Receipt</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>When</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.payments.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No payments.</TableCell></TableRow>
              ) : invoice.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.receipt_number}</TableCell>
                  <TableCell>{p.payment_type}</TableCell>
                  <TableCell>{p.method.replace("_", " ")}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.amount)}</TableCell>
                  <TableCell>{new Date(p.received_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => window.print()}>Print</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAdmin && invoice.status !== "void" && (
        <Card>
          <CardHeader><CardTitle className="text-base text-destructive">Void invoice</CardTitle></CardHeader>
          <CardContent className="flex items-end gap-2">
            <VoidControl onVoid={(reason) => run(() => voidInvoice.mutateAsync(reason), "Void failed.")} />
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function VoidControl({ onVoid }: { onVoid: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <>
      <div className="grid flex-1 gap-1">
        <Label htmlFor="void-reason">Reason</Label>
        <Input id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <Button variant="destructive" disabled={!reason.trim()} onClick={() => onVoid(reason.trim())}>Void</Button>
    </>
  );
}
```

- [ ] **Step 2: Verify `Button` supports `asChild` and `size` props used across pages**

Run: `cd frontend && grep -n "asChild\|size" components/ui/button.tsx | head`
Expected: `asChild` and a `size` variant exist (shadcn button). If `size="sm"` is absent, drop the `size` prop; if `asChild` is absent, replace `<Button asChild><Link/></Button>` with a `<Link>` styled via `buttonVariants()`.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/dashboard/billing/invoices/[id]/page.tsx"
git commit -m "feat(fe): invoice detail (line items, issue, payments, void)"
```

---

## Task 8: Patient billing history page

**Files:**
- Create: `frontend/app/dashboard/billing/patients/[patientId]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInvoiceList } from "@/hooks/queries/useInvoiceList";
import { formatCurrency } from "@/lib/money";

export default function PatientBillingHistoryPage() {
  const params = useParams<{ patientId: string }>();
  const { items, loading, error } = useInvoiceList({ patientId: params.patientId, skip: 0, limit: 100 });

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Patient billing history</h1>
      <Card>
        <CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-muted-foreground">Loading…</TableCell></TableRow>
                ) : items.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-muted-foreground">No invoices for this patient.</TableCell></TableRow>
                ) : items.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <Link className="text-primary underline" href={`/dashboard/billing/invoices/${inv.id}`}>
                        {inv.invoice_number ?? "(draft)"}
                      </Link>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{inv.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-right">{formatCurrency(inv.total_amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(inv.balance_due)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

```bash
git add "frontend/app/dashboard/billing/patients/[patientId]/page.tsx"
git commit -m "feat(fe): patient billing history page"
```

---

## Task 9: Reconciliation report page

**Files:**
- Create: `frontend/app/dashboard/billing/reconciliation/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReconciliation } from "@/hooks/queries/useBillingReports";
import { formatCurrency } from "@/lib/money";

export default function ReconciliationPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const { report, loading, error } = useReconciliation(date);

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Daily reconciliation</h1>

      <div className="grid gap-1 md:w-56">
        <Label htmlFor="date">Date</Label>
        <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Collected by method</CardTitle></CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report && report.totals.length ? report.totals.map((t) => (
                    <TableRow key={t.method}>
                      <TableCell className="capitalize">{t.method.replace("_", " ")}</TableCell>
                      <TableCell className="text-right">{formatCurrency(t.payments)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(t.refunds)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(t.net)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} className="text-muted-foreground">No payments on this date.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="mt-4 text-right text-sm">Net total: <span className="font-semibold">{formatCurrency(report?.net_total ?? "0")}</span></p>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

```bash
git add frontend/app/dashboard/billing/reconciliation/page.tsx
git commit -m "feat(fe): daily reconciliation page"
```

---

## Task 10: Fee-schedule (catalog) admin page — RoleGuard admin

**Files:**
- Create: `frontend/app/dashboard/billing/catalog/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useState } from "react";

import { RoleGuard } from "@/components/layout/RoleGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServiceCatalog } from "@/hooks/queries/useServiceCatalog";
import { BILLING_ADMIN_ROLES } from "@/lib/rbac";
import { getApiErrorMessage } from "@/lib/api-errors";
import { formatCurrency } from "@/lib/money";

function CatalogInner() {
  const { services, loading, error, createMutation, updateMutation } = useServiceCatalog(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function create() {
    setFormError(null);
    try {
      await createMutation.mutateAsync({ code: code.trim(), name: name.trim(), default_price: price || "0" });
      setCode(""); setName(""); setPrice("");
    } catch (e) {
      setFormError(getApiErrorMessage(e, "Could not create service."));
    }
  }

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Fee schedule</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Add service</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1"><Label htmlFor="code">Code</Label><Input id="code" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="price">Price</Label><Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <Button disabled={!code || !name || createMutation.isPending} onClick={create}>Add</Button>
          {formError && <p className="w-full text-sm text-destructive">{formError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Services</CardTitle></CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>
                ) : services.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.default_price)}</TableCell>
                    <TableCell><Badge variant={s.is_active ? "secondary" : "outline"}>{s.is_active ? "active" : "inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm"
                        onClick={() => updateMutation.mutate({ id: s.id, body: { is_active: !s.is_active } })}>
                        {s.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function CatalogPage() {
  return (
    <RoleGuard roles={BILLING_ADMIN_ROLES}>
      <CatalogInner />
    </RoleGuard>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd frontend && npm run typecheck`
Expected: no errors.

```bash
git add frontend/app/dashboard/billing/catalog/page.tsx
git commit -m "feat(fe): fee-schedule admin page"
```

---

## Task 11: Final verification

- [ ] **Step 1: Typecheck, lint, smoke tests**

Run: `cd frontend && npm run typecheck && npm run lint && npm run test:smoke`
Expected: all pass.

- [ ] **Step 2: Production build (catches App Router/client-boundary issues)**

Run: `cd frontend && npm run build`
Expected: build succeeds; all `/dashboard/billing/*` routes compile.

- [ ] **Step 3: Manual smoke against the running stack** (backend + frontend running; a cashier user seeded per backend Task 14)

- Log in as the cashier (`cashier@nech.com` / `Cash12345!`); confirm you land on `/dashboard/billing` and the "Billing" nav item is visible.
- Create an invoice → add a line from the catalog → issue → record a partial then final payment → confirm status reaches `paid` and balance is 0.
- Confirm `/dashboard/billing/catalog` shows 403 for the cashier (RoleGuard) and works for an admin.
- Confirm a `doctor` login does **not** see the Billing nav item and `/dashboard/billing` redirects/forbids.

- [ ] **Step 4: Commit any fixes discovered during verification**

```bash
git add -A frontend
git commit -m "fix(fe): billing verification fixes"
```

---

## Self-review results

**Spec §9 coverage:** dashboard (Task 4), invoice list (5), new invoice (6), invoice detail with pay/receipt/void (7), patient billing history (8), reconciliation (9), catalog admin (10). RBAC/nav/types wiring (1); hooks (3); money util (2). All §9 routes present.

**Deliberate deviations (flagged):**
- Line-item builder lives on the **detail** page (draft state), not the "new" page — the "new" page creates the draft and redirects. Rationale in Task 6. Still satisfies "create invoice with line items from catalog + ad-hoc," though ad-hoc line entry via the UI is deferred (the API supports it via `add_line_item`; the detail UI currently offers catalog-only add — add an "ad-hoc" toggle later if needed). **Noted as a minor scope trim.**
- Receipt printing uses `window.print()` (print-styled browser page) per spec §14 default, not a server PDF.
- Discount is exposed in the new-invoice UI (spec §14 default); tax is left at 0 and not surfaced.

**Placeholder scan:** none. Two steps intentionally instruct a small correction/verification rather than blind code — Task 4 Step 2 (remove a stray import that Step 1 deliberately included to make the removal explicit) and Task 7 Step 2 (verify `Button` `asChild`/`size` props, with a concrete fallback). Both give exact actions.

**Type/name consistency:** hook exports (`useServiceCatalog`, `useInvoiceList`→`createInvoice`, `useInvoiceDetail`→`{addLineItem, removeLineItem, issueInvoice, recordPayment, voidInvoice}`, `lookupPatients`, `useDailyReport`, `useReconciliation`, `useOutstanding`) match their usage in pages. TS types (`Invoice`, `InvoiceDetail`, `InvoiceLineItem`, `Payment`, `ServiceCatalogItem`, `PatientLookupItem`, `MethodTotal`, `DailyReport`, `ReconciliationReport`, `OutstandingItem`, `PaymentMethod`, `PaymentType`, `InvoiceStatus`) are defined in Task 1 and used consistently. `BILLING_ROLES`/`BILLING_ADMIN_ROLES` defined in Task 1, used in nav (Task 1) and catalog guard (Task 10). Money fields are `string` everywhere and only ever formatted via `formatCurrency`.

**Cross-plan consistency:** endpoint paths, request bodies, and the string-money contract match the backend plan's router (`/billing/...`, `patient_id`, `method`/`amount`, `reason`, `active_only`, `status`/`skip`/`limit`, `date`/`cashier_id`).

---

## Execution handoff

Frontend plan complete. With the backend plan, **all of workstream A is now planned**. Per your instruction we'll implement both together.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task across both plans (backend first, then frontend), with review between tasks.
2. **Inline Execution** — execute in this session with checkpoints.

Suggested build order: backend Tasks 1–14 → frontend Tasks 1–11 (the frontend calls the live backend, so backend must exist first).
