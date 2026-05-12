"use client";

import { useRef } from "react";
import { Mic, Square, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { cn } from "@/lib/utils";

function formatMmSs(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex h-10 items-end justify-center gap-0.5" aria-hidden>
      {Array.from({ length: 24 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "w-1 rounded-full bg-primary/40 transition-all duration-150",
            active && "animate-pulse bg-primary",
          )}
          style={{
            height: active ? `${8 + ((i * 17) % 24)}px` : "6px",
            animationDelay: active ? `${i * 40}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}

type AudioRecorderProps = {
  isProcessing: boolean;
  onSubmitRecording: (blob: Blob, durationSeconds: number) => Promise<void>;
  onSubmitFile: (file: File) => Promise<void>;
};

export function AudioRecorder({ isProcessing, onSubmitRecording, onSubmitFile }: AudioRecorderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    status,
    durationSeconds,
    audioBlob,
    audioUrl,
    error,
    nineMinuteWarning,
    maxDurationReached,
    isSupported,
    startRecording,
    stopRecording,
    resetRecording,
  } = useAudioRecorder();

  const busy = isProcessing || status === "recording";

  async function handleTranscribeRecording() {
    if (!audioBlob) return;
    await onSubmitRecording(audioBlob, durationSeconds);
  }

  return (
    <Card className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <CardHeader className="border-b border-black/5 bg-[#fcfcfd] pb-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1f2937] text-white shadow-sm">
            <Mic className="h-5 w-5" />
          </span>
          <span className="rounded-full border border-[#eadfd4] bg-[#fff7f2] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#b4542d]">
            Live capture
          </span>
        </div>
        <CardTitle className="text-[1.35rem] font-semibold tracking-[-0.02em] text-slate-900">Recorder</CardTitle>
        <CardDescription className="max-w-2xl text-[0.95rem] leading-7 text-slate-500">
          Urdu and English medical speech. WebM, MP3, WAV, or M4A up to 50MB. Long clips (≥30s) use async
          processing with live status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-6">
        {!isSupported && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            Recording is not supported in this browser. Use file upload instead.
          </p>
        )}
        {error && <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        {nineMinuteWarning && !maxDurationReached && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            9 minutes reached. Recording stops automatically at 10:00.
          </p>
        )}
        {maxDurationReached && (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Maximum recording length (10 minutes) reached.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            className={cn(
              "h-11 rounded-full bg-[#c85d35] px-5 text-sm font-medium text-white shadow-sm transition hover:bg-[#b4542d]",
              status === "recording" && "animate-pulse ring-2 ring-[#c85d35]/30",
            )}
            disabled={busy || !isSupported}
            onClick={() => void startRecording()}
          >
            <Mic className="h-4 w-4" />
            {status === "recording" ? "Recording…" : "Start recording"}
          </Button>
          <Button
            type="button"
            className="h-11 rounded-full bg-[#1f2937] px-5 text-sm font-medium text-white transition hover:bg-[#111827]"
            disabled={status !== "recording"}
            onClick={stopRecording}
          >
            <Square className="h-4 w-4" />
            Stop
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border border-[#d8dde6] bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Upload audio
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.webm,.mp3,.wav,.m4a"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onSubmitFile(f);
            }}
          />
        </div>

        <div className="rounded-[24px] border border-[#edf0f5] bg-[#f7f8fa] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Elapsed time</p>
              <span className="font-mono text-[2rem] font-semibold tabular-nums tracking-[-0.04em] text-slate-900">
                {formatMmSs(durationSeconds)}
              </span>
            </div>
            <Waveform active={status === "recording"} />
          </div>
        </div>

        {audioUrl && status === "preview" && (
          <div className="space-y-3 rounded-[24px] border border-[#edf0f5] bg-[#fcfcfd] p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Review before sending to the transcription service
            </p>
            <audio controls src={audioUrl} className="w-full" />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-11 rounded-full bg-[#1f2937] px-5 text-sm font-medium text-white transition hover:bg-[#111827]"
                disabled={busy || !audioBlob}
                onClick={() => void handleTranscribeRecording()}
              >
                {isProcessing ? "Processing…" : "Stop & transcribe"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 rounded-full border border-[#d8dde6] bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                disabled={busy}
                onClick={resetRecording}
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        {isProcessing && (
          <p className="text-sm leading-7 text-slate-500">
            Processing… For long audio the server queues a job and this page polls every 2 seconds.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
