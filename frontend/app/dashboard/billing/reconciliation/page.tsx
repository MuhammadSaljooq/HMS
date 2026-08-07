"use client";

import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useReconciliation } from "@/hooks/queries/useBillingReports";
import { formatCurrency, todayInClinicTz } from "@/lib/money";

export default function ReconciliationPage() {
  const [date, setDate] = useState(() => todayInClinicTz());
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
