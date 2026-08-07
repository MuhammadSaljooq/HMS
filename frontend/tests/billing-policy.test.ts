import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultDashboardPath, isDashboardRouteAllowed } from "../lib/rbac";
import { formatCurrency, sumMoney } from "../lib/money";

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

test("money helpers", () => {
  assert.ok(formatCurrency("600.00").includes("600"));
  assert.equal(sumMoney(["300.00", "250.50"]), "550.50");
});
