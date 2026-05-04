import { api } from "@/lib/api";
import type { TranscriptionJobQueued, TranscriptionJobStatus, TranscriptionPipelineResult } from "@/types";

/** Backend uses ≥30s for async; keep in sync with TRANSCRIBE_ASYNC_THRESHOLD_SECONDS. */
export const TRANSCRIBE_ASYNC_THRESHOLD_SECONDS = 30;

const POLL_MS = 2000;
const MAX_POLLS = 180;

export type SubmitTranscriptionOutcome = {
  result: TranscriptionPipelineResult;
  mode: "sync" | "async";
  jobId?: string;
};

export function readAudioDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    audio.onloadedmetadata = () => {
      const d = audio.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read audio duration from file."));
    };
  });
}

export async function submitTranscriptionFromFile(file: File): Promise<SubmitTranscriptionOutcome> {
  const durationSeconds = await readAudioDurationSeconds(file);
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("duration_seconds", String(Math.max(0, Math.round(durationSeconds))));

  if (durationSeconds < TRANSCRIBE_ASYNC_THRESHOLD_SECONDS) {
    const { data } = await api.post<TranscriptionPipelineResult>("/transcribe", fd);
    return { mode: "sync", result: data };
  }

  const { data: job } = await api.post<TranscriptionJobQueued>("/transcribe/async", fd);
  const result = await pollTranscriptionJob(job.job_id, job.transcription_id);
  return { mode: "async", result, jobId: job.job_id };
}

export async function submitTranscriptionAudio(
  blob: Blob,
  durationSeconds: number,
  filename = "recording.webm",
): Promise<SubmitTranscriptionOutcome> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  fd.append("duration_seconds", String(Math.max(0, Math.round(durationSeconds))));

  if (durationSeconds < TRANSCRIBE_ASYNC_THRESHOLD_SECONDS) {
    const { data } = await api.post<TranscriptionPipelineResult>("/transcribe", fd);
    return { mode: "sync", result: data };
  }

  const { data: job } = await api.post<TranscriptionJobQueued>("/transcribe/async", fd);
  const result = await pollTranscriptionJob(job.job_id, job.transcription_id);
  return { mode: "async", result, jobId: job.job_id };
}

async function pollTranscriptionJob(jobId: string, transcriptionId: string): Promise<TranscriptionPipelineResult> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const { data: st } = await api.get<TranscriptionJobStatus>(`/transcribe/${encodeURIComponent(jobId)}/status`, {
      params: { transcription_id: transcriptionId },
    });

    if (st.celery_state === "FAILURE" || st.transcription_status === "failed") {
      throw new Error(st.error || "Transcription job failed.");
    }

    if (st.transcription_status === "completed") {
      const { data } = await api.get<TranscriptionPipelineResult>(`/transcribe/${transcriptionId}`);
      return data;
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  throw new Error("Transcription is still processing. Check again from the history list.");
}

export async function fetchPipelineResult(transcriptionId: string): Promise<TranscriptionPipelineResult> {
  const { data } = await api.get<TranscriptionPipelineResult>(`/transcribe/${transcriptionId}`);
  return data;
}
