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
