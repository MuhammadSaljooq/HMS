import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultDashboardPath, hasRequiredRole, isDashboardRouteAllowed } from "../lib/rbac";
import { CLINICAL_VIEW_ROLES } from "../lib/rbac";

test("admin is a superuser across every gated area", () => {
  for (const path of [
    "/dashboard",
    "/dashboard/patients",
    "/dashboard/patients/123",
    "/dashboard/patients/new",
    "/dashboard/appointments",
    "/dashboard/appointments/abc",
    "/dashboard/records",
    "/dashboard/records/abc",
    "/dashboard/transcriber",
    "/dashboard/billing",
    "/dashboard/billing/catalog",
    "/dashboard/settings",
    "/dashboard/doctors-staff",
    "/dashboard/inventory",
  ]) {
    assert.equal(isDashboardRouteAllowed(path, "admin"), true, `admin allowed on ${path}`);
  }
  assert.equal(hasRequiredRole("admin", CLINICAL_VIEW_ROLES), true);
});

test("per-role landing paths", () => {
  assert.equal(getDefaultDashboardPath("admin"), "/dashboard");
  assert.equal(getDefaultDashboardPath("doctor"), "/dashboard/records");
  assert.equal(getDefaultDashboardPath("nurse"), "/dashboard/patients");
  assert.equal(getDefaultDashboardPath("receptionist"), "/dashboard/appointments");
  assert.equal(getDefaultDashboardPath("cashier"), "/dashboard/billing");
});

test("cashier: billing only, denied on clinical sections", () => {
  assert.equal(isDashboardRouteAllowed("/dashboard/billing", "cashier"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing/invoices", "cashier"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing/catalog", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/patients", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/patients/123", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/appointments", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/records", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/records/abc", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/transcriber", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard", "cashier"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/settings", "cashier"), false);
});

test("nurse: patients/appointments/records view, denied elsewhere", () => {
  assert.equal(isDashboardRouteAllowed("/dashboard/patients", "nurse"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/patients/123", "nurse"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/appointments", "nurse"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/appointments/abc", "nurse"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/records", "nurse"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/records/abc", "nurse"), true);
  // nurse cannot register a patient
  assert.equal(isDashboardRouteAllowed("/dashboard/patients/new", "nurse"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/transcriber", "nurse"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing", "nurse"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/settings", "nurse"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard", "nurse"), false);
});

test("receptionist: patients (incl. register), appointments, records view; denied transcriber/billing", () => {
  assert.equal(isDashboardRouteAllowed("/dashboard/patients", "receptionist"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/patients/new", "receptionist"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/appointments", "receptionist"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/records", "receptionist"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/records/abc", "receptionist"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/transcriber", "receptionist"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing", "receptionist"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/settings", "receptionist"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard", "receptionist"), false);
});

test("doctor: clinical + transcriber; denied billing/settings/dashboard-home", () => {
  assert.equal(isDashboardRouteAllowed("/dashboard/patients", "doctor"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/patients/new", "doctor"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/appointments", "doctor"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/records", "doctor"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/transcriber", "doctor"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/billing", "doctor"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/settings", "doctor"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard", "doctor"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/doctors-staff", "doctor"), false);
});
