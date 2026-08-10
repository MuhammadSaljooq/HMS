"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDailyReport, useOutstanding } from "@/hooks/queries/useBillingReports";
import { formatCurrency, todayInClinicTz } from "@/lib/money";

function today(): string {
  return todayInClinicTz();
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
