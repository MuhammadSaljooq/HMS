"use client";

import { useMemo, useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { TranscriptionListItem, TranscriptionPipelineResult } from "@/types";

export type HistoryFilter = "all" | "linked" | "unlinked";

type MergedRow = {
  id: string;
  at: string;
  status: string;
  patientName: string | null;
  duration: number | null;
  source: "remote" | "local";
  remote?: TranscriptionListItem;
  local?: TranscriptionPipelineResult;
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function statusTone(status: string) {
  switch (status.toLowerCase()) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-600";
    case "processing":
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

type TranscriptionHistoryProps = {
  remote: TranscriptionListItem[];
  localRecent: TranscriptionPipelineResult[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onPickPipeline: (transcriptionId: string) => void;
  onPickLocal: (result: TranscriptionPipelineResult) => void;
};

export function TranscriptionHistory({
  remote,
  localRecent,
  loading,
  error,
  onRefresh,
  onPickPipeline,
  onPickLocal,
}: TranscriptionHistoryProps) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const merged = useMemo(() => {
    const seen = new Set<string>();
    const rows: MergedRow[] = [];
    const remoteSorted = [...remote].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    for (const r of remoteSorted) {
      seen.add(r.id);
      rows.push({
        id: r.id,
        at: r.created_at,
        status: r.status,
        patientName: r.patient_full_name ?? null,
        duration: r.duration_seconds,
        source: "remote",
        remote: r,
      });
    }
    for (const loc of localRecent) {
      const id = loc.transcription_id;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({
        id,
        at: new Date().toISOString(),
        status: loc.status,
        patientName: null,
        duration: null,
        source: "local",
        local: loc,
      });
    }
    const top = rows.slice(0, 10);
    if (filter === "all") return top;
    if (filter === "linked") return top.filter((x) => x.patientName);
    return top.filter((x) => !x.patientName);
  }, [remote, localRecent, filter]);

  return (
    <section className="rounded-[28px] border border-[#efe6dd] bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
      <div className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[1.2rem] font-semibold tracking-[-0.02em] text-slate-900">Recent transcriptions</h4>
          <p className="mt-1 text-sm leading-6 text-slate-500">Last 10 from the server and this device session</p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center rounded-full border border-[#e6ddd4] bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-[#f8f6f3]"
          onClick={() => void onRefresh()}
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="mt-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "linked", "unlinked"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={cn(
                "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition",
                filter === f
                  ? "border border-[#c85d35] bg-[#c85d35] text-white shadow-[0_10px_20px_rgba(200,93,53,0.2)] hover:bg-[#b4542d]"
                  : "border border-[#e6ddd4] bg-white text-slate-600 hover:bg-[#f8f6f3]",
              )}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "linked" ? "Linked" : "Unlinked"}
            </button>
          ))}
        </div>
        {error && <p className="text-xs leading-6 text-slate-500">{error}</p>}
        <ScrollArea className="h-[min(420px,50vh)] pr-2">
          <ul className="space-y-3">
            {merged.length === 0 && !loading && (
              <li className="rounded-[22px] border border-[#f0e8df] bg-[#fffaf6] px-4 py-5 text-sm text-slate-500">
                No transcriptions match this filter.
              </li>
            )}
            {merged.map((row) => {
              const expanded = openId === row.id;
              return (
                <li
                  key={row.id}
                  className={cn(
                    "overflow-hidden rounded-[22px] border bg-[#fffaf6] transition",
                    expanded ? "border-[#dfd1c3] shadow-[0_12px_24px_rgba(15,23,42,0.06)]" : "border-[#f0e8df]",
                  )}
                >
                  <button
                    type="button"
                    className="flex w-full flex-col gap-2 px-4 py-4 text-left text-sm transition hover:bg-[#fff6ef]"
                    onClick={() => {
                      setOpenId(expanded ? null : row.id);
                      if (row.source === "remote") onPickPipeline(row.id);
                      else if (row.local) onPickLocal(row.local);
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-400">{formatWhen(row.at)}</span>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                          statusTone(row.status),
                        )}
                      >
                        {row.status}
                      </span>
                    </div>
                    <span className="text-[15px] font-semibold text-slate-900">{row.patientName ?? "Not linked"}</span>
                    {row.duration != null && (
                      <span className="text-xs text-slate-500">{row.duration}s audio</span>
                    )}
                  </button>
                  {expanded && row.remote && (
                    <div className="border-t border-[#f0e8df] bg-white px-4 py-3 text-xs leading-6 text-slate-500">
                      <p className="line-clamp-4 whitespace-pre-wrap">{row.remote.cleaned_transcript || row.remote.raw_transcript || "—"}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </div>
    </section>
  );
}
