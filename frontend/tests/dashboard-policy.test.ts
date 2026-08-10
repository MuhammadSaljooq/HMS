import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultDashboardPath, isDashboardRouteAllowed, postLoginPath } from "../lib/rbac";

test("role home paths stay aligned with login landing behavior", () => {
  assert.equal(getDefaultDashboardPath("admin"), "/dashboard");
  assert.equal(getDefaultDashboardPath("doctor"), "/dashboard/records");
  assert.equal(getDefaultDashboardPath("nurse"), "/dashboard/patients");
  assert.equal(getDefaultDashboardPath("receptionist"), "/dashboard/appointments");

  assert.equal(postLoginPath("doctor", null), "/dashboard/records");
  assert.equal(postLoginPath("nurse", "/dashboard/patients"), "/dashboard/patients");
  assert.equal(postLoginPath("receptionist", "/dashboard/settings"), "/dashboard/appointments");
});

test("route protection keeps admin broad access and role-specific restrictions", () => {
  assert.equal(isDashboardRouteAllowed("/dashboard", "admin"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/settings", "admin"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/transcriber", "admin"), true);

  assert.equal(isDashboardRouteAllowed("/dashboard/settings", "doctor"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/transcriber", "doctor"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/transcriber", "nurse"), false);

  assert.equal(isDashboardRouteAllowed("/dashboard/patients/new", "receptionist"), true);
  assert.equal(isDashboardRouteAllowed("/dashboard/patients/new", "nurse"), false);
  assert.equal(isDashboardRouteAllowed("/dashboard/doctors-staff", "doctor"), false);
});
