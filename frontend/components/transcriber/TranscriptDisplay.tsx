"use client";

import { useCallback, useMemo } from "react";
import { Check, ChevronDown, Copy, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import type { TranscriptionPipelineResult, TranscriptionSections } from "@/types";

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

type TranscriptDisplayProps = {
  phase: PipelinePhase;
  result: TranscriptionPipelineResult | null;
  error: string | null;
  /** True after this transcription is linked to a medical record. */
  isLinked: boolean;
  onAttachClick: () => void;
};

export function TranscriptDisplay({ phase, result, error, isLinked, onAttachClick }: TranscriptDisplayProps) {
  const sections = result?.sections;

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
      <Card className="border-border">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">Raw transcript</CardTitle>
            <CardDescription>Direct speech-to-text output</CardDescription>
          </div>
          {result?.raw_transcript && (
            <Button type="button" size="icon" variant="ghost" aria-label="Copy raw" onClick={() => copyText(result.raw_transcript ?? "")}>
              <Copy className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="min-h-[180px] rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm leading-relaxed">
            {error && <p className="text-destructive">{error}</p>}
            {!error && phase !== "idle" && phase !== "completed" && phase !== "failed" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {phaseLabel(phase)}…
              </div>
            )}
            {!error && (phase === "idle" || (!result?.raw_transcript && phase === "completed")) && (
              <p className="text-muted-foreground">No raw transcript yet.</p>
            )}
            {result?.raw_transcript && <p className="whitespace-pre-wrap">{result.raw_transcript}</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="text-lg">Cleaned medical note</CardTitle>
            <CardDescription>Structured English note</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {result?.language_detected && (
              <Badge variant="secondary" className="font-normal">
                {result.language_detected}
              </Badge>
            )}
            <Badge
              variant={phase === "failed" ? "destructive" : phase === "completed" ? "default" : "outline"}
              className="gap-1 font-normal"
            >
              {phase !== "completed" && phase !== "failed" && phase !== "idle" && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {phase === "completed" && <Check className="h-3 w-3" />}
              {phaseLabel(phase)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {result?.cleaned_transcript && !hasStructured && (
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button type="button" size="sm" variant="outline" onClick={() => copyText(result.cleaned_transcript ?? "")}>
                  <Copy className="mr-1 h-3 w-3" />
                  Copy note
                </Button>
              </div>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm leading-relaxed">
                {result.cleaned_transcript}
              </p>
            </div>
          )}

          {hasStructured &&
            SECTION_KEYS.map(({ key, label }) => {
              const text = sections?.[key];
              if (!text || !String(text).trim()) return null;
              return (
                <Collapsible key={key} defaultOpen>
                  <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50">
                    {label}
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="border border-t-0 border-border px-3 py-2 text-sm leading-relaxed">
                    <div className="flex justify-end pb-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => copyText(String(text))}>
                        <Copy className="mr-1 h-3 w-3" />
                        Copy section
                      </Button>
                    </div>
                    <p className="whitespace-pre-wrap">{text}</p>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

          {!result?.cleaned_transcript && phase === "completed" && !error && (
            <p className="text-sm text-muted-foreground">No cleaned text returned.</p>
          )}

          <div className="pt-2">
            <Button type="button" variant="outline" disabled={!result || isLinked} onClick={onAttachClick}>
              <Link2 className="mr-2 h-4 w-4" />
              {isLinked ? "Attached to patient record" : "Attach to patient record"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
