"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <Card className="border-border">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-lg">Recent transcriptions</CardTitle>
          <CardDescription>Last 10 — server list plus this device session</CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => void onRefresh()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {(["all", "linked", "unlinked"] as const).map((f) => (
            <Button key={f} type="button" size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "linked" ? "Linked" : "Unlinked"}
            </Button>
          ))}
        </div>
        {error && <p className="text-xs text-muted-foreground">{error}</p>}
        <ScrollArea className="h-[min(420px,50vh)] pr-3">
          <ul className="space-y-2">
            {merged.length === 0 && !loading && (
              <li className="text-sm text-muted-foreground">No transcriptions match this filter.</li>
            )}
            {merged.map((row) => {
              const expanded = openId === row.id;
              return (
                <li key={row.id} className="rounded-md border border-border bg-card">
                  <button
                    type="button"
                    className="flex w-full flex-col gap-1 px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={() => {
                      setOpenId(expanded ? null : row.id);
                      if (row.source === "remote") onPickPipeline(row.id);
                      else if (row.local) onPickLocal(row.local);
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">{formatWhen(row.at)}</span>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {row.status}
                      </Badge>
                    </div>
                    <span className="font-medium">{row.patientName ?? "Not linked"}</span>
                    {row.duration != null && (
                      <span className="text-xs text-muted-foreground">{row.duration}s audio</span>
                    )}
                  </button>
                  {expanded && row.remote && (
                    <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                      <p className="line-clamp-4 whitespace-pre-wrap">{row.remote.cleaned_transcript || row.remote.raw_transcript || "—"}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
