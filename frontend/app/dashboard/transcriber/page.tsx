"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { AttachToRecordDialog } from "@/components/transcriber/AttachToRecordDialog";
import { AudioRecorder } from "@/components/transcriber/AudioRecorder";
import { TranscriptDisplay } from "@/components/transcriber/TranscriptDisplay";
import { TranscriptionHistory } from "@/components/transcriber/TranscriptionHistory";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranscription } from "@/hooks/useTranscription";
import { submitTranscriptionAudio, submitTranscriptionFromFile } from "@/lib/transcribe-api";
import { api } from "@/lib/api";
import { TRANSCRIBER_ROLES } from "@/lib/rbac";
import type { Transcription, TranscriptionPipelineResult } from "@/types";

type Phase = "idle" | "pending" | "processing" | "completed" | "failed";

function phaseFromStatus(s: TranscriptionPipelineResult["status"]): Phase {
  if (s === "failed") return "failed";
  if (s === "completed") return "completed";
  if (s === "pending" || s === "processing") return "processing";
  return "idle";
}

export default function TranscriberPage() {
  const {
    localRecent,
    remoteList,
    loadingList,
    listError,
    pushLocalResult,
    refreshRemoteList,
    loadPipeline,
  } = useTranscription();

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<TranscriptionPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const refreshLinkedMeta = useCallback(async (transcriptionId: string) => {
    try {
      const { data } = await api.get<Transcription>(`/transcriptions/${transcriptionId}`);
      setIsLinked(!!data.medical_record_id);
    } catch {
      setIsLinked(false);
    }
  }, []);

  useEffect(() => {
    void refreshRemoteList();
  }, [refreshRemoteList]);

  const applyPipeline = useCallback(
    async (r: TranscriptionPipelineResult) => {
      setResult(r);
      setPhase(phaseFromStatus(r.status));
      setError(null);
      pushLocalResult(r);
      await refreshLinkedMeta(r.transcription_id);
    },
    [pushLocalResult, refreshLinkedMeta],
  );

  const handleRecording = useCallback(
    async (blob: Blob, durationSeconds: number) => {
      setIsProcessing(true);
      setPhase("processing");
      setError(null);
      try {
        const out = await submitTranscriptionAudio(blob, durationSeconds, "recording.webm");
        await applyPipeline(out.result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Transcription failed.";
        setError(msg);
        setPhase("failed");
      } finally {
        setIsProcessing(false);
      }
    },
    [applyPipeline],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setIsProcessing(true);
      setPhase("processing");
      setError(null);
      try {
        const out = await submitTranscriptionFromFile(file);
        await applyPipeline(out.result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Transcription failed.";
        setError(msg);
        setPhase("failed");
      } finally {
        setIsProcessing(false);
      }
    },
    [applyPipeline],
  );

  const handlePickPipeline = useCallback(
    async (transcriptionId: string) => {
      setIsProcessing(true);
      setError(null);
      try {
        const r = await loadPipeline(transcriptionId);
        await applyPipeline(r);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Could not load transcription.";
        setError(msg);
      } finally {
        setIsProcessing(false);
      }
    },
    [applyPipeline, loadPipeline],
  );

  return (
    <RoleGuard roles={TRANSCRIBER_ROLES}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="font-sans text-2xl font-semibold tracking-tight">AI transcriber</h1>
          <p className="text-sm text-muted-foreground">
            Record or upload audio. Short clips run synchronously; longer clips queue on the server and poll every 2
            seconds.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-3">
            <AudioRecorder
              isProcessing={isProcessing}
              onSubmitRecording={handleRecording}
              onSubmitFile={handleFile}
            />
            <TranscriptDisplay
              phase={phase}
              result={result}
              error={error}
              isLinked={isLinked}
              onAttachClick={() => result && setAttachOpen(true)}
            />
          </div>
          <div className="space-y-4 lg:col-span-2">
            <TranscriptionHistory
              remote={remoteList}
              localRecent={localRecent}
              loading={loadingList}
              error={listError}
              onRefresh={() => void refreshRemoteList()}
              onPickPipeline={(id) => void handlePickPipeline(id)}
              onPickLocal={(r) => void applyPipeline(r)}
            />
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-base">Quick actions</CardTitle>
                <CardDescription>Jump to related workflows</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/patients">Patient list</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/records">Medical records</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {result && (
          <AttachToRecordDialog
            open={attachOpen}
            onOpenChange={setAttachOpen}
            transcriptionId={result.transcription_id}
            onLinked={async () => {
              setIsLinked(true);
              await refreshRemoteList();
            }}
          />
        )}
      </div>
    </RoleGuard>
  );
}
