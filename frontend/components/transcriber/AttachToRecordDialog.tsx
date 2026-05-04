"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePatients } from "@/hooks/usePatients";
import { api } from "@/lib/api";
import type { MedicalRecord, Patient } from "@/types";

type AttachToRecordDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transcriptionId: string;
  onLinked: () => void;
};

export function AttachToRecordDialog({ open, onOpenChange, transcriptionId, onLinked }: AttachToRecordDialogProps) {
  const { list: searchPatients } = usePatients();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [recordId, setRecordId] = useState<string>("");
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setPatient(null);
      setRecords([]);
      setRecordId("");
      setFormError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      void (async () => {
        try {
          const res = await searchPatients({ search: query.trim(), limit: 8, skip: 0 });
          setHits(res.items);
        } catch {
          setHits([]);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [query, searchPatients]);

  useEffect(() => {
    if (!open || !patient) {
      setRecords([]);
      setRecordId("");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingRecords(true);
      try {
        const { data } = await api.get<MedicalRecord[]>("/records", { params: { patient_id: patient.id } });
        if (!cancelled) {
          setRecords(data);
          setRecordId(data[0]?.id ?? "");
        }
      } catch {
        if (!cancelled) {
          setRecords([]);
          setRecordId("");
        }
      } finally {
        if (!cancelled) setLoadingRecords(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, patient]);

  async function submit() {
    if (!recordId) {
      setFormError("Select a medical record.");
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await api.patch(`/transcriptions/${transcriptionId}/link`, { medical_record_id: recordId });
      onLinked();
      onOpenChange(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not link transcription.";
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Attach to patient record</DialogTitle>
          <DialogDescription>Search by name or MRN, then choose the medical record to link this transcription to.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Patient</Label>
            <Input placeholder="Name or MRN…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {!patient && hits.length > 0 && (
              <ul className="max-h-36 overflow-auto rounded-md border border-border text-sm">
                {hits.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted"
                      onClick={() => {
                        setPatient(p);
                        setQuery(p.full_name);
                        setHits([]);
                      }}
                    >
                      <span className="font-medium">{p.full_name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{p.mrn}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {patient && (
              <p className="text-sm">
                Selected: <span className="font-medium">{patient.full_name}</span>{" "}
                <button type="button" className="text-primary underline" onClick={() => setPatient(null)}>
                  Change
                </button>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Medical record</Label>
            {loadingRecords && <p className="text-xs text-muted-foreground">Loading records…</p>}
            {!loadingRecords && patient && records.length === 0 && (
              <p className="text-xs text-muted-foreground">No records for this patient. Create one from the patient profile.</p>
            )}
            {records.length > 0 && (
              <Select value={recordId} onValueChange={setRecordId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose record" />
                </SelectTrigger>
                <SelectContent>
                  {records.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {new Date(r.created_at).toLocaleDateString()} — {r.diagnosis?.slice(0, 40) || "No diagnosis"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={submitting || !recordId} onClick={() => void submit()}>
            {submitting ? "Linking…" : "Link transcription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
