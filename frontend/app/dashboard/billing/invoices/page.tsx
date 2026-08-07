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
