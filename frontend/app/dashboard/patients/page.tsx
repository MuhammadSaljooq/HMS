"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  PatientTable,
  buildPatientRows,
  type PatientRow,
  type PatientSortKey,
  type SortDir,
} from "@/components/patients/PatientTable";
import { Skeleton } from "@/components/ui/skeleton";
import { usePatients } from "@/hooks/usePatients";

const PAGE_SIZE = 20;

const VALID_SORT = new Set<PatientSortKey>([
  "mrn",
  "full_name",
  "age",
  "gender",
  "phone",
  "blood_group",
  "last_visit",
  "created_at",
]);

const TEXT_SORT_DEFAULTS = new Set<PatientSortKey>(["full_name", "mrn", "gender", "phone", "blood_group"]);

function parseSort(raw: string | null): PatientSortKey {
  if (raw && VALID_SORT.has(raw as PatientSortKey)) return raw as PatientSortKey;
  return "created_at";
}

function parseDir(raw: string | null): SortDir {
  return raw === "asc" ? "asc" : "desc";
}

function defaultDirFor(key: PatientSortKey): SortDir {
  return TEXT_SORT_DEFAULTS.has(key) ? "asc" : "desc";
}

function PatientsListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 max-w-md flex-1" />
        <Skeleton className="h-10 w-44" />
      </div>
      <Skeleton className="h-[420px] w-full rounded-md" />
      <div className="flex justify-between">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-52" />
      </div>
    </div>
  );
}

function PatientsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { list } = usePatients();

  const searchFromUrl = searchParams.get("search") ?? "";
  const pageNum = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageIndex = pageNum - 1;
  const sortKey = useMemo(() => parseSort(searchParams.get("sort")), [searchParams]);
  const sortDir = useMemo(() => parseDir(searchParams.get("dir")), [searchParams]);

  const [queryInput, setQueryInput] = useState(searchFromUrl);
  useEffect(() => {
    setQueryInput(searchFromUrl);
  }, [searchFromUrl]);

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const p = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") p.delete(k);
        else p.set(k, v);
      }
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSearchChange = useCallback(
    (value: string) => {
      setQueryInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setParams({ search: value.trim() || undefined, page: "1" });
      }, 350);
    },
    [setParams],
  );

  const [rows, setRows] = useState<PatientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await list({
          search: searchFromUrl.trim() || undefined,
          skip: pageIndex * PAGE_SIZE,
          limit: PAGE_SIZE,
          sort_by: sortKey,
          sort_order: sortDir,
        });
        if (cancelled) return;

        setRows(buildPatientRows(data.items));
        setTotal(data.total);
      } catch {
        if (!cancelled) {
          setRows([]);
          setTotal(0);
          setLoadError("Could not load patients. Try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [list, pageIndex, searchFromUrl, sortDir, sortKey]);

  const onSortChange = useCallback(
    (key: PatientSortKey) => {
      if (sortKey === key) {
        setParams({ sort: key, dir: sortDir === "asc" ? "desc" : "asc" });
      } else {
        setParams({ sort: key, dir: defaultDirFor(key), page: "1" });
      }
    },
    [setParams, sortDir, sortKey],
  );

  const onPageChange = useCallback(
    (zeroBased: number) => {
      setParams({ page: String(zeroBased + 1) });
    },
    [setParams],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patients</h1>
        <p className="text-sm text-muted-foreground">Search by name, MRN, or phone. Click a row to open the patient profile.</p>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}

      <PatientTable
        rows={rows}
        total={total}
        loading={loading}
        page={pageIndex}
        pageSize={PAGE_SIZE}
        search={queryInput}
        onSearchChange={onSearchChange}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={onSortChange}
        onPageChange={onPageChange}
      />
    </div>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<PatientsListSkeleton />}>
      <PatientsPageContent />
    </Suspense>
  );
}
