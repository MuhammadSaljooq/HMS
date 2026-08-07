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
