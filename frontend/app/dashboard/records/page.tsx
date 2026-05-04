"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PatientCard } from "@/components/patients/PatientCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatients } from "@/hooks/usePatients";
import type { Patient } from "@/types";

export default function RecordsHubPage() {
  const { list } = usePatients();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const res = await list({ search: query.trim(), limit: 12, skip: 0 });
          setHits(res.items);
        } catch {
          setHits([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [query, list]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Medical records</h1>
        <p className="text-sm text-muted-foreground">
          Find a patient to view their medical records and prescriptions. Records are also available on each patient
          profile.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search patients</CardTitle>
          <CardDescription>Search by name, MRN, or phone, then open the patient&apos;s record list.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="q">Search</Label>
            <Input id="q" placeholder="Name, MRN, phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {loading && <p className="text-sm text-muted-foreground">Searching…</p>}
          {!loading && query.trim() && hits.length === 0 && (
            <p className="text-sm text-muted-foreground">No patients match this search.</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {hits.map((p) => (
              <div key={p.id} className="flex flex-col gap-2">
                <PatientCard patient={p} />
                <Button asChild size="sm" variant="outline">
                  <Link href={`/dashboard/records/${p.id}`}>View records</Link>
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
