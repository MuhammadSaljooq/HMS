"use client";

import Link from "next/link";
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
import { usePatientDirectoryQuery } from "@/hooks/queries/usePatientDirectoryQuery";
import styles from "./theme-patients.module.css";

const tableThemeClassNames = {
  root: styles.tableRoot,
  toolbar: styles.tableToolbar,
  searchWrap: styles.tableSearchWrap,
  searchInput: styles.tableSearchInput,
  createButton: styles.tableCreateButton,
  tableShell: styles.tableShell,
  sortButton: styles.tableSortButton,
  row: styles.tableBodyRow,
  emptyCell: styles.tableEmptyCell,
  footer: styles.tableFooter,
  footerMeta: styles.tableFooterMeta,
  pagerWrap: styles.tablePagerWrap,
  pagerButton: styles.tablePagerButton,
  loadingPulse: styles.tableLoadingPulse,
};

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
    <>
      <div className={styles.main}>
        <Skeleton className="h-14 w-72 rounded-md" />
        <div className={styles.statRow}>
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[560px] w-full rounded-2xl" />
      </div>
      <div className={styles.rightPanel}>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    </>
  );
}

function PatientsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const directoryQuery = usePatientDirectoryQuery({
    search: searchFromUrl.trim() || undefined,
    skip: pageIndex * PAGE_SIZE,
    limit: PAGE_SIZE,
    sort_by: sortKey,
    sort_order: sortDir,
  });

  const rows = useMemo<PatientRow[]>(() => buildPatientRows(directoryQuery.items), [directoryQuery.items]);
  const total = directoryQuery.total;
  const loading = directoryQuery.loading;
  const loadError = directoryQuery.error;

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

  const genderStats = useMemo(() => {
    const stats = { female: 0, male: 0, other: 0 };
    for (const row of rows) {
      const value = (row.gender || "").toLowerCase();
      if (value === "female") stats.female += 1;
      else if (value === "male") stats.male += 1;
      else stats.other += 1;
    }
    return stats;
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasSearch = queryInput.trim().length > 0;
  const currentRangeLabel =
    total === 0 ? "No visible rows" : `${pageIndex * PAGE_SIZE + 1}-${Math.min(total, (pageIndex + 1) * PAGE_SIZE)}`;

  return (
    <>
      <main className={styles.main}>
        <div className={styles.heroRow}>
          <div>
            <h1 className={styles.heroTitle}>Patients Registry</h1>
            <p className={styles.heroSubtitle}>
              Search by name, MRN, or phone. Click a row to open the patient profile.
            </p>
          </div>
          <Link href="/dashboard/patients/new" className={styles.makeConfBtn}>
            + Register patient
          </Link>
        </div>

        <div className={styles.statRow}>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Visible records</p>
            <p className={styles.summaryValue}>{loading ? "..." : rows.length}</p>
            <p className={styles.summarySub}>{loading ? "Loading directory rows..." : `Showing range ${currentRangeLabel}`}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Total patients</p>
            <p className={styles.summaryValue}>{loading ? "..." : total}</p>
            <p className={styles.summarySub}>{hasSearch ? "Filtered by the current search term." : "Complete patient directory count."}</p>
          </div>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>Directory page</p>
            <p className={styles.summaryValue}>{loading ? "..." : `${pageIndex + 1}/${totalPages}`}</p>
            <p className={styles.summarySub}>{hasSearch ? `Search active: "${queryInput.trim()}"` : "Browse newest registrations or sort columns."}</p>
          </div>
        </div>

        {loadError && <p className={styles.errorText}>{loadError}</p>}

        <div className={styles.contentColumn}>
          <div className={styles.dataCard}>
            <header className={styles.dataHeader}>
              <div>
                <h3 className={styles.dataTitle}>Patient directory</h3>
                <p className={styles.heroSubtitle} style={{ margin: 0 }}>
                  Browse, sort, and open charts from one registry worklist.
                </p>
              </div>
              <span className={styles.dropdown}>{hasSearch ? "Filtered view" : "Live registry"}</span>
            </header>
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
              showCreateButton={false}
              classNames={tableThemeClassNames}
            />
          </div>
        </div>
      </main>

      <aside className={styles.rightPanel}>
        <header className={styles.panelHeader}>
          <h3 className={styles.panelTitle}>Patient Snapshot</h3>
          <span className={styles.smallBtn}>🔍</span>
        </header>

        <div className={styles.reminderCard}>
          <span className={styles.reminderIcon}>📁</span>
          <p className={styles.reminderText}>
            {hasSearch
              ? `Search is focused on "${queryInput.trim()}". Open any row to continue into the patient chart.`
              : "Use the registry to open patient charts, check demographics, and move into records or appointments."}
          </p>
          <span className={styles.remindBtn}>Live</span>
        </div>

        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Gender split (this page)</p>
          <div className={styles.badgeRow}>
            <span className={styles.statBadge}>F {genderStats.female}</span>
            <span className={styles.statBadge}>M {genderStats.male}</span>
            <span className={styles.statBadge}>Other {genderStats.other}</span>
          </div>
        </div>

        <div className={styles.conferenceList}>
          <Link href="/dashboard/patients/new" className={styles.confItem}>
            <div>
              <span className={styles.confDate}>Create</span>
              <span className={styles.confHour}>NEW</span>
            </div>
            <div>
              <p className={styles.confName}>Register patient</p>
              <p className={styles.confDoctor}>Add a new chart before scheduling the first visit.</p>
            </div>
            <span className={styles.confArrow}>↗</span>
          </Link>
          <Link href="/dashboard/records" className={styles.confItem}>
            <div>
              <span className={styles.confDate}>Chart</span>
              <span className={styles.confHour}>REC</span>
            </div>
            <div>
              <p className={styles.confName}>Open records workflow</p>
              <p className={styles.confDoctor}>Jump from directory to encounter history and review.</p>
            </div>
            <span className={styles.confArrow}>↗</span>
          </Link>
          <Link href="/dashboard/appointments" className={styles.confItem}>
            <div>
              <span className={styles.confDate}>Visit</span>
              <span className={styles.confHour}>APT</span>
            </div>
            <div>
              <p className={styles.confName}>Review appointments</p>
              <p className={styles.confDoctor}>Cross-check scheduled visits with patient charts.</p>
            </div>
            <span className={styles.confArrow}>↗</span>
          </Link>
        </div>

        <Link href="/dashboard/patients/new" className={styles.makeBtn}>
          + Register patient
        </Link>
        <Link href="/dashboard/records" className={styles.makeConfBtn}>
          + Open records
          </Link>
      </aside>
    </>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<PatientsListSkeleton />}>
      <PatientsPageContent />
    </Suspense>
  );
}
