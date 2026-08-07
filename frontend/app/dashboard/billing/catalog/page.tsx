"use client";

import { useState } from "react";

import { RoleGuard } from "@/components/layout/RoleGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useServiceCatalog } from "@/hooks/queries/useServiceCatalog";
import { BILLING_ADMIN_ROLES } from "@/lib/rbac";
import { getApiErrorMessage } from "@/lib/api-errors";
import { formatCurrency } from "@/lib/money";

function CatalogInner() {
  const { services, loading, error, createMutation, updateMutation } = useServiceCatalog(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function create() {
    setFormError(null);
    try {
      await createMutation.mutateAsync({ code: code.trim(), name: name.trim(), default_price: price || "0" });
      setCode(""); setName(""); setPrice("");
    } catch (e) {
      setFormError(getApiErrorMessage(e, "Could not create service."));
    }
  }

  return (
    <main className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Fee schedule</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Add service</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1"><Label htmlFor="code">Code</Label><Input id="code" value={code} onChange={(e) => setCode(e.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="name">Name</Label><Input id="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid gap-1"><Label htmlFor="price">Price</Label><Input id="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <Button disabled={!code || !name || createMutation.isPending} onClick={create}>Add</Button>
          {formError && <p className="w-full text-sm text-destructive">{formError}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Services</CardTitle></CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell></TableRow>
                ) : services.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.code}</TableCell>
                    <TableCell>{s.name}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.default_price)}</TableCell>
                    <TableCell><Badge variant={s.is_active ? "secondary" : "outline"}>{s.is_active ? "active" : "inactive"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm"
                        onClick={() => updateMutation.mutate({ id: s.id, body: { is_active: !s.is_active } })}>
                        {s.is_active ? "Deactivate" : "Activate"}
                      </Button>
                    </TableCell>
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

export default function CatalogPage() {
  return (
    <RoleGuard roles={BILLING_ADMIN_ROLES}>
      <CatalogInner />
    </RoleGuard>
  );
}
