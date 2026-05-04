"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_SECONDS = 600;
const NINE_MIN = 540;

export type RecorderStatus = "idle" | "recording" | "preview" | "error";

export type UseAudioRecorderResult = {
  status: RecorderStatus;
  durationSeconds: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  mimeType: string;
  error: string | null;
  nineMinuteWarning: boolean;
  maxDurationReached: boolean;
  isSupported: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
};

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "audio/webm";
}

export function useAudioRecorder(): UseAudioRecorderResult {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("audio/webm");
  const [error, setError] = useState<string | null>(null);
  const [nineMinuteWarning, setNineMinuteWarning] = useState(false);
  const [maxDurationReached, setMaxDurationReached] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedNineRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const resetRecording = useCallback(() => {
    clearTimer();
    stopStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setDurationSeconds(0);
    setStatus("idle");
    setError(null);
    setNineMinuteWarning(false);
    setMaxDurationReached(false);
    warnedNineRef.current = false;
  }, [audioUrl, clearTimer, stopStream]);

  const stopRecording = useCallback(() => {
    clearTimer();
    const mr = mediaRecorderRef.current;
    if (mr && mr.state === "recording") {
      try {
        mr.requestData();
      } catch {
        /* ignore */
      }
      mr.stop();
    }
    stopStream();
    setStatus("preview");
  }, [clearTimer, stopStream]);

  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl, clearTimer, stopStream]);

  const startRecording = useCallback(async () => {
    setError(null);
    setNineMinuteWarning(false);
    setMaxDurationReached(false);
    warnedNineRef.current = false;
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    chunksRef.current = [];
    setDurationSeconds(0);

    if (!isSupported) {
      setError("Recording is not supported in this browser.");
      setStatus("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      setMimeType(mime.split(";")[0] || "audio/webm");
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported(mime) ? mime : undefined });
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const type = mr.mimeType || mime.split(";")[0] || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mr.start(500);
      setStatus("recording");

      timerRef.current = setInterval(() => {
        setDurationSeconds((d) => {
          const next = d + 1;
          if (next >= NINE_MIN && !warnedNineRef.current) {
            warnedNineRef.current = true;
            setNineMinuteWarning(true);
          }
          if (next >= MAX_SECONDS) {
            setMaxDurationReached(true);
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            const rec = mediaRecorderRef.current;
            if (rec && rec.state === "recording") {
              try {
                rec.requestData();
              } catch {
                /* ignore */
              }
              rec.stop();
            }
            stopStream();
            setStatus("preview");
            return MAX_SECONDS;
          }
          return next;
        });
      }, 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not access microphone.");
      setStatus("error");
    }
  }, [audioUrl, isSupported, stopStream]);

  return {
    status,
    durationSeconds,
    audioBlob,
    audioUrl,
    mimeType,
    error,
    nineMinuteWarning,
    maxDurationReached,
    isSupported,
    startRecording,
    stopRecording,
    resetRecording,
  };
}
