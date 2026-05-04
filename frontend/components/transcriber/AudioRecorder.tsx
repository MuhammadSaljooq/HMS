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
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg">Recorder</CardTitle>
        <CardDescription>
          Urdu and English medical speech. WebM, MP3, WAV, or M4A up to 50MB. Long clips (≥30s) use async
          processing with live status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isSupported && (
          <p className="text-sm text-destructive">Recording is not supported in this browser. Use file upload.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {nineMinuteWarning && !maxDurationReached && (
          <p className="text-sm text-amber-700 dark:text-amber-400">9 minutes reached — recording stops at 10:00.</p>
        )}
        {maxDurationReached && (
          <p className="text-sm text-muted-foreground">Maximum recording length (10 minutes) reached.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="default"
            className={cn(
              "gap-2 bg-primary text-primary-foreground",
              status === "recording" && "animate-pulse ring-2 ring-destructive/60",
            )}
            disabled={busy || !isSupported}
            onClick={() => void startRecording()}
          >
            <Mic className="h-4 w-4" />
            {status === "recording" ? "Recording…" : "Start recording"}
          </Button>
          <Button type="button" variant="secondary" disabled={status !== "recording"} onClick={stopRecording}>
            <Square className="h-4 w-4" />
            Stop
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
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

        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-2xl tabular-nums">{formatMmSs(durationSeconds)}</span>
            <Waveform active={status === "recording"} />
          </div>
        </div>

        {audioUrl && status === "preview" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Review before sending to the transcription service.</p>
            <audio controls src={audioUrl} className="w-full max-w-md" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={busy || !audioBlob} onClick={() => void handleTranscribeRecording()}>
                {isProcessing ? "Processing…" : "Stop & transcribe"}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={resetRecording}>
                Discard
              </Button>
            </div>
          </div>
        )}

        {isProcessing && (
          <p className="text-sm text-muted-foreground">
            Processing… For long audio the server queues a job and this page polls every 2 seconds.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
