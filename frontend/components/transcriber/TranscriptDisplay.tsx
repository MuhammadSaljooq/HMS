"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, ChevronDown, Copy, Link2, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { TranscriptionPipelineResult, TranscriptionSections, TranscriptionStatus } from "@/types";

const SECTION_KEYS: { key: keyof TranscriptionSections; label: string }[] = [
  { key: "chief_complaint", label: "Chief complaint" },
  { key: "history", label: "History of present illness" },
  { key: "examination", label: "Examination findings" },
  { key: "assessment", label: "Assessment / diagnosis" },
  { key: "plan", label: "Plan / prescription" },
];

type PipelinePhase = "idle" | "pending" | "processing" | "completed" | "failed";

function phaseLabel(phase: PipelinePhase) {
  switch (phase) {
    case "pending":
    case "processing":
      return "Processing";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return "Idle";
  }
}

/** Server-side review status for the selected transcription. */
function reviewLabel(status: TranscriptionStatus | null) {
  switch (status) {
    case "approved":
      return "Approved";
    case "reviewed":
      return "Reviewed";
    case "completed":
      return "Completed";
    default:
      return null;
  }
}

type TranscriptDisplayProps = {
  phase: PipelinePhase;
  result: TranscriptionPipelineResult | null;
  error: string | null;
  /** True after this transcription is linked to a medical record. */
  isLinked: boolean;
  /** Server review status of the selected transcription (completed/reviewed/approved). */
  reviewStatus: TranscriptionStatus | null;
  /** Whether the cleaned transcript has been manually edited. */
  edited: boolean;
  /** Persist edits to the cleaned transcript. */
  onSaveEdits: (cleanedTranscript: string) => Promise<void>;
  /** Mark the transcript approved. */
  onApprove: () => Promise<void>;
  onAttachClick: () => void;
};

export function TranscriptDisplay({
  phase,
  result,
  error,
  isLinked,
  reviewStatus,
  edited,
  onSaveEdits,
  onApprove,
  onAttachClick,
}: TranscriptDisplayProps) {
  const sections = result?.sections;

  const [draft, setDraft] = useState<string>("");
  const [savingEdits, setSavingEdits] = useState(false);
  const [approving, setApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Seed the editable draft whenever a different transcription / cleaned text loads.
  useEffect(() => {
    setDraft(result?.cleaned_transcript ?? "");
    setActionError(null);
  }, [result?.transcription_id, result?.cleaned_transcript]);

  const isApproved = reviewStatus === "approved";
  const dirty = draft !== (result?.cleaned_transcript ?? "");

  const handleSaveEdits = useCallback(async () => {
    if (!result) return;
    setSavingEdits(true);
    setActionError(null);
    try {
      await onSaveEdits(draft);
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Could not save transcript edits.");
    } finally {
      setSavingEdits(false);
    }
  }, [draft, onSaveEdits, result]);

  const handleApprove = useCallback(async () => {
    if (!result) return;
    setApproving(true);
    setActionError(null);
    try {
      await onApprove();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : "Could not approve transcript.");
    } finally {
      setApproving(false);
    }
  }, [onApprove, result]);

  const hasStructured = useMemo(() => {
    if (!sections) return false;
    return SECTION_KEYS.some(({ key }) => {
      const v = sections[key];
      return typeof v === "string" && v.trim().length > 0;
    });
  }, [sections]);

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 border-b border-black/5 bg-[#fcfcfd]">
          <div>
            <CardTitle className="text-[1.2rem] font-semibold tracking-[-0.02em] text-slate-900">Raw transcript</CardTitle>
            <CardDescription className="text-slate-500">Direct speech-to-text output</CardDescription>
          </div>
          {result?.raw_transcript && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Copy raw"
              onClick={() => copyText(result.raw_transcript ?? "")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-6">
          <div className="min-h-[220px] rounded-[24px] border border-dashed border-[#d8dde6] bg-[#f7f8fa] p-4 text-sm leading-7 text-slate-700">
            {error && <p className="text-red-600">{error}</p>}
            {!error && phase !== "idle" && phase !== "completed" && phase !== "failed" && (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                {phaseLabel(phase)}…
              </div>
            )}
            {!error && (phase === "idle" || (!result?.raw_transcript && phase === "completed")) && (
              <p className="text-slate-500">No raw transcript yet.</p>
            )}
            {result?.raw_transcript && (
              <p dir="auto" className="whitespace-pre-wrap">
                {result.raw_transcript}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0 border-b border-black/5 bg-[#fcfcfd]">
          <div>
            <CardTitle className="text-[1.2rem] font-semibold tracking-[-0.02em] text-slate-900">Cleaned medical note</CardTitle>
            <CardDescription className="text-slate-500">Structured English note</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {result?.language_detected && (
              <Badge className="rounded-full border border-[#eadfd4] bg-[#fff7f2] px-3 py-1 font-medium text-[#b4542d] shadow-none hover:bg-[#fff7f2]">
                {result.language_detected}
              </Badge>
            )}
            {edited && (
              <Badge className="gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-700 shadow-none hover:bg-amber-50">
                <Pencil className="h-3 w-3" />
                Edited
              </Badge>
            )}
            {reviewLabel(reviewStatus) && (
              <Badge
                className={
                  reviewStatus === "approved"
                    ? "gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700 shadow-none hover:bg-emerald-50"
                    : reviewStatus === "reviewed"
                      ? "gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-700 shadow-none hover:bg-sky-50"
                      : "gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-600 shadow-none hover:bg-slate-50"
                }
              >
                {reviewStatus === "approved" && <BadgeCheck className="h-3 w-3" />}
                {reviewLabel(reviewStatus)}
              </Badge>
            )}
            <Badge
              className={
                phase === "failed"
                  ? "gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 font-medium text-red-600 shadow-none hover:bg-red-50"
                  : phase === "completed"
                    ? "gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700 shadow-none hover:bg-emerald-50"
                    : "gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium text-slate-600 shadow-none hover:bg-slate-50"
              }
            >
              {phase !== "completed" && phase !== "failed" && phase !== "idle" && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {phase === "completed" && <Check className="h-3 w-3" />}
              {phaseLabel(phase)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          {result?.cleaned_transcript != null && phase === "completed" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Review &amp; edit note
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border border-[#d8dde6] bg-white px-4 text-slate-700 hover:bg-slate-50"
                  onClick={() => copyText(draft)}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy note
                </Button>
              </div>
              {/* dir="auto" so mixed Urdu (RTL) + English renders with correct base direction. */}
              <Textarea
                dir="auto"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={isApproved || savingEdits}
                rows={8}
                className="min-h-[180px] whitespace-pre-wrap rounded-[24px] border border-[#edf0f5] bg-[#f7f8fa] p-4 text-sm leading-7 text-slate-700"
                placeholder="Cleaned medical note…"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border border-[#d8dde6] bg-white px-4 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={isApproved || savingEdits || !dirty}
                  onClick={() => void handleSaveEdits()}
                >
                  {savingEdits && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  <Pencil className="mr-1 h-3 w-3" />
                  Save edits
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full bg-emerald-600 px-4 text-white hover:bg-emerald-700 disabled:opacity-50"
                  disabled={isApproved || approving || dirty}
                  onClick={() => void handleApprove()}
                >
                  {approving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  <BadgeCheck className="mr-1 h-3 w-3" />
                  {isApproved ? "Approved" : "Approve"}
                </Button>
                {dirty && !isApproved && (
                  <span className="text-xs text-slate-400">Save edits before approving.</span>
                )}
              </div>
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}
            </div>
          )}

          {hasStructured &&
            SECTION_KEYS.map(({ key, label }) => {
              const text = sections?.[key];
              if (!text || !String(text).trim()) return null;
              return (
                <Collapsible key={key} defaultOpen>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-[20px] border border-[#edf0f5] bg-[#f7f8fa] px-4 py-3 text-left text-sm font-semibold text-slate-800 transition hover:bg-[#eef2f7]">
                    {label}
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="rounded-b-[20px] border border-t-0 border-[#edf0f5] bg-white px-4 py-3 text-sm leading-7 text-slate-700">
                    <div className="flex justify-end pb-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        onClick={() => copyText(String(text))}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copy section
                      </Button>
                    </div>
                    <p dir="auto" className="whitespace-pre-wrap">
                      {text}
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

          {!result?.cleaned_transcript && phase === "completed" && !error && (
            <p className="text-sm text-slate-500">No cleaned text returned.</p>
          )}

          <div className="space-y-1 pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full border border-[#1f2937] bg-[#1f2937] px-5 text-sm font-medium text-white hover:bg-[#111827] hover:text-white disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
              disabled={!result || isLinked}
              onClick={onAttachClick}
            >
              <Link2 className="mr-2 h-4 w-4" />
              {isLinked ? "Attached to patient record" : "Attach to patient record"}
            </Button>
            {result && !isLinked && !isApproved && (
              <p className="text-xs text-slate-400">Approve the transcript before attaching.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
