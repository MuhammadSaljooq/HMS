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
