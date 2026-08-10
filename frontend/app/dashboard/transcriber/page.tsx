"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { AttachToRecordDialog } from "@/components/transcriber/AttachToRecordDialog";
import { AudioRecorder } from "@/components/transcriber/AudioRecorder";
import { TranscriptDisplay } from "@/components/transcriber/TranscriptDisplay";
import { TranscriptionHistory } from "@/components/transcriber/TranscriptionHistory";
import { RoleGuard } from "@/components/layout/RoleGuard";
import { useTranscription } from "@/hooks/useTranscription";
import { submitTranscriptionAudio, submitTranscriptionFromFile } from "@/lib/transcribe-api";
import { api } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";
import { TRANSCRIBER_ROLES } from "@/lib/rbac";
import type { Transcription, TranscriptionPipelineResult, TranscriptionStatus } from "@/types";
import styles from "../theme-dashboard.module.css";

type Phase = "idle" | "pending" | "processing" | "completed" | "failed";

function phaseFromStatus(s: TranscriptionPipelineResult["status"]): Phase {
  if (s === "failed") return "failed";
  // reviewed/approved are post-completion states — keep the review surface visible.
  if (s === "completed" || s === "reviewed" || s === "approved") return "completed";
  if (s === "pending" || s === "processing") return "processing";
  return "idle";
}

function phaseLabel(phase: Phase) {
  switch (phase) {
    case "processing":
      return "Processing";
    case "completed":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return "Ready";
  }
}

export default function TranscriberPage() {
  const {
    localRecent,
    remoteList,
    loadingList,
    listError,
    pushLocalResult,
    refreshRemoteList,
    editTranscript,
    approveTranscript,
    loadPipeline,
  } = useTranscription();

  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<TranscriptionPipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [reviewStatus, setReviewStatus] = useState<TranscriptionStatus | null>(null);
  const [edited, setEdited] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);

  const refreshLinkedMeta = useCallback(async (transcriptionId: string) => {
    try {
      const { data } = await api.get<Transcription>(`/transcriptions/${transcriptionId}`);
      setIsLinked(!!data.medical_record_id);
      setReviewStatus(data.status);
      setEdited(!!data.edited);
    } catch {
      setIsLinked(false);
      setReviewStatus(null);
      setEdited(false);
    }
  }, []);

  const handleSaveEdits = useCallback(
    async (cleanedTranscript: string) => {
      if (!result) return;
      const updated = await editTranscript(result.transcription_id, cleanedTranscript);
      setResult((prev) => (prev ? { ...prev, cleaned_transcript: updated.cleaned_transcript } : prev));
      setReviewStatus(updated.status);
      setEdited(!!updated.edited);
    },
    [editTranscript, result],
  );

  const handleApprove = useCallback(async () => {
    if (!result) return;
    const updated = await approveTranscript(result.transcription_id);
    setReviewStatus(updated.status);
    setEdited(!!updated.edited);
  }, [approveTranscript, result]);

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
        setError(getApiErrorMessage(e, "Transcription failed."));
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
        setError(getApiErrorMessage(e, "Transcription failed."));
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
        setError(getApiErrorMessage(e, "Could not load transcription."));
      } finally {
        setIsProcessing(false);
      }
    },
    [applyPipeline, loadPipeline],
  );

  return (
    <RoleGuard roles={TRANSCRIBER_ROLES}>
      <>
        <main className={styles.main}>
          <div className={styles.heroRow}>
            <div>
              <h1 className={styles.heroTitle}>AI Transcriber</h1>
              <p className={styles.heroSubtitle}>
                Record or upload consultation audio, review structured notes, and attach the result to a patient chart.
              </p>
            </div>
            <span className={styles.dropdown}>Urdu + English</span>
          </div>

          <div className={styles.statRow}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Current phase</p>
              <p className={styles.summaryValue}>{phase === "idle" ? "Ready" : phaseLabel(phase)}</p>
              <p className={styles.summarySub}>
                {isProcessing ? "Audio is being processed by the transcription pipeline." : "Recorder is ready for a new clip."}
              </p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Queue items</p>
              <p className={styles.summaryValue}>{loadingList ? "..." : remoteList.length}</p>
              <p className={styles.summarySub}>Recent server-side transcriptions available from this workspace.</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Patient link</p>
              <p className={styles.summaryValue}>{result ? (isLinked ? "Linked" : "Pending") : "None"}</p>
              <p className={styles.summarySub}>
                {result ? "Attach the cleaned note to keep the medical record workflow complete." : "No transcription selected yet."}
              </p>
            </div>
          </div>

          <div className={styles.contentColumn}>
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
              reviewStatus={reviewStatus}
              edited={edited}
              onSaveEdits={handleSaveEdits}
              onApprove={handleApprove}
              onAttachClick={() => result && setAttachOpen(true)}
            />
          </div>
        </main>

        <aside className={styles.rightPanel}>
          <header className={styles.panelHeader}>
            <h3 className={styles.panelTitle}>Transcription Queue</h3>
            <span className={styles.smallBtn}>🎙</span>
          </header>
          <TranscriptionHistory
            remote={remoteList}
            localRecent={localRecent}
            loading={loadingList}
            error={listError}
            onRefresh={() => void refreshRemoteList()}
            onPickPipeline={(id) => void handlePickPipeline(id)}
            onPickLocal={(r) => void applyPipeline(r)}
          />

          <div className={styles.reminderCard}>
            <span className={styles.reminderIcon}>🩺</span>
            <p className={styles.reminderText}>
              Best results come from short, clear clips with one speaker at a time and audible patient complaints.
            </p>
            <span className={styles.remindBtn}>Tip</span>
          </div>

          <div className={styles.conferenceList}>
            <Link href="/dashboard/patients" className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Chart</span>
                <span className={styles.confHour}>PAT</span>
              </div>
              <div>
                <p className={styles.confName}>Open patient list</p>
                <p className={styles.confDoctor}>Find the chart before attaching a completed note.</p>
              </div>
              <span className={styles.confArrow}>↗</span>
            </Link>
            <Link href="/dashboard/records" className={styles.confItem}>
              <div>
                <span className={styles.confDate}>Record</span>
                <span className={styles.confHour}>REC</span>
              </div>
              <div>
                <p className={styles.confName}>Review medical records</p>
                <p className={styles.confDoctor}>Cross-check the generated note with the latest encounter history.</p>
              </div>
              <span className={styles.confArrow}>↗</span>
            </Link>
          </div>
        </aside>

        {result && (
          <AttachToRecordDialog
            open={attachOpen}
            onOpenChange={setAttachOpen}
            transcriptionId={result.transcription_id}
            isApproved={reviewStatus === "approved"}
            onApprove={handleApprove}
            onLinked={async () => {
              setIsLinked(true);
              await refreshRemoteList();
            }}
          />
        )}
      </>
    </RoleGuard>
  );
}
