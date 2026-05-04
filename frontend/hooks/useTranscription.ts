"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { fetchPipelineResult } from "@/lib/transcribe-api";
import type { TranscriptionListItem, TranscriptionPipelineResult } from "@/types";

const LS_KEY = "hms_transcriber_recent_v1";
const MAX_LOCAL = 10;

function loadLocalRecent(): TranscriptionPipelineResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TranscriptionPipelineResult[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_LOCAL) : [];
  } catch {
    return [];
  }
}

function saveLocalRecent(items: TranscriptionPipelineResult[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, MAX_LOCAL)));
  } catch {
    /* ignore quota */
  }
}

export function useTranscription() {
  const [localRecent, setLocalRecent] = useState<TranscriptionPipelineResult[]>([]);
  const [remoteList, setRemoteList] = useState<TranscriptionListItem[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    setLocalRecent(loadLocalRecent());
  }, []);

  const pushLocalResult = useCallback((result: TranscriptionPipelineResult) => {
    setLocalRecent((prev) => {
      const next = [result, ...prev.filter((r) => r.transcription_id !== result.transcription_id)].slice(
        0,
        MAX_LOCAL,
      );
      saveLocalRecent(next);
      return next;
    });
  }, []);

  const refreshRemoteList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const { data } = await api.get<TranscriptionListItem[]>("/transcriptions");
      setRemoteList(data);
    } catch (e: unknown) {
      setRemoteList([]);
      const msg = e instanceof Error ? e.message : "Could not load transcription list.";
      setListError(msg);
    } finally {
      setLoadingList(false);
    }
  }, []);

  const linkToMedicalRecord = useCallback(async (transcriptionId: string, medicalRecordId: string) => {
    await api.patch(`/transcriptions/${transcriptionId}/link`, { medical_record_id: medicalRecordId });
    await refreshRemoteList();
  }, [refreshRemoteList]);

  const loadPipeline = useCallback(async (transcriptionId: string) => {
    return fetchPipelineResult(transcriptionId);
  }, []);

  return {
    localRecent,
    remoteList,
    loadingList,
    listError,
    pushLocalResult,
    refreshRemoteList,
    linkToMedicalRecord,
    loadPipeline,
  };
}
