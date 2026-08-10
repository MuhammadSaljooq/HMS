"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { calculateAge, formatDate } from "@/lib/patient-utils";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types";

export type PatientSortKey =
  | "mrn"
  | "full_name"
  | "age"
  | "gender"
  | "phone"
  | "blood_group"
  | "last_visit"
  | "created_at";
export type SortDir = "asc" | "desc";

export type PatientRow = Patient & {
  age: number;
  lastVisit: string | null;
};

type PatientTableProps = {
  rows: PatientRow[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  search: string;
  onSearchChange: (value: string) => void;
  sortKey: PatientSortKey;
  sortDir: SortDir;
  onSortChange: (key: PatientSortKey) => void;
  onPageChange: (page: number) => void;
  showCreateButton?: boolean;
  classNames?: {
    root?: string;
    toolbar?: string;
    searchWrap?: string;
    searchInput?: string;
    createButton?: string;
    tableShell?: string;
    sortButton?: string;
    row?: string;
    emptyCell?: string;
    footer?: string;
    footerMeta?: string;
    pagerWrap?: string;
    pagerButton?: string;
    loadingPulse?: string;
  };
};

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-50" />;
  return dir === "asc" ? (
    <ArrowUp className="ml-1 inline h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="ml-1 inline h-3.5 w-3.5" />
  );
}

export function PatientTable({
  rows,
  total,
  loading,
  page,
  pageSize,
  search,
  onSearchChange,
  sortKey,
  sortDir,
  onSortChange,
  onPageChange,
  showCreateButton = true,
  classNames,
}: PatientTableProps) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  const th = (key: PatientSortKey, label: string, className?: string) => (
    <TableHead className={className}>
      <button
        type="button"
        className={cn("inline-flex items-center font-medium hover:text-primary", classNames?.sortButton)}
        onClick={() => onSortChange(key)}
      >
        {label}
        <SortIcon active={sortKey === key} dir={sortDir} />
      </button>
    </TableHead>
  );

  return (
    <div className={cn("space-y-4", classNames?.root)}>
      <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", classNames?.toolbar)}>
        <div className={cn("relative max-w-md flex-1", classNames?.searchWrap)}>
          <Input
            placeholder="Search by name, MRN, or phone…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className={cn("pr-3", classNames?.searchInput)}
            aria-label="Search patients"
          />
        </div>
        {showCreateButton ? (
          <Button asChild className={cn("bg-primary text-primary-foreground hover:bg-primary/90 shrink-0", classNames?.createButton)}>
            <Link href="/dashboard/patients/new">Register new patient</Link>
          </Button>
        ) : null}
      </div>

      <div className={cn("rounded-md border border-border bg-card", classNames?.tableShell)}>
        <Table>
          <TableHeader>
            <TableRow>
              {th("mrn", "MRN")}
              {th("full_name", "Full name")}
              {th("age", "Age", "w-[72px]")}
              {th("gender", "Gender", "hidden md:table-cell")}
              {th("phone", "Phone", "hidden lg:table-cell")}
              {th("blood_group", "Blood", "w-[88px]")}
              {th("last_visit", "Last visit", "hidden xl:table-cell")}
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className={cn("h-4 animate-pulse rounded bg-muted", classNames?.loadingPulse)} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className={cn("h-24 text-center text-muted-foreground", classNames?.emptyCell)}>
                  No patients match your search.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn("cursor-pointer hover:bg-muted/50", classNames?.row)}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/dashboard/patients/${p.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/dashboard/patients/${p.id}`);
                    }
                  }}
                >
                  <TableCell className="font-mono text-xs font-medium">{p.mrn}</TableCell>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{p.age}</TableCell>
                  <TableCell className="hidden md:table-cell">{p.gender || "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{p.phone || "—"}</TableCell>
                  <TableCell>{p.blood_group || "—"}</TableCell>
                  <TableCell className="hidden xl:table-cell text-muted-foreground text-sm">
                    {p.lastVisit ? formatDate(p.lastVisit) : "—"}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" asChild aria-label="View patient">
                      <Link href={`/dashboard/patients/${p.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <div className={cn("flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between", classNames?.footer)}>
        <p className={classNames?.footerMeta}>
          {total === 0 ? (
            "No results"
          ) : (
            <>
              Showing <span className="font-mono text-foreground">{start}</span>–
              <span className="font-mono text-foreground">{end}</span> of{" "}
              <span className="font-mono text-foreground">{total}</span>
            </>
          )}
        </p>
        <div className={cn("flex items-center gap-2", classNames?.pagerWrap)}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={classNames?.pagerButton}
            disabled={page <= 0 || loading}
            onClick={() => onPageChange(page - 1)}
          >
            Previous
          </Button>
          <span className="tabular-nums">
            Page {page + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={classNames?.pagerButton}
            disabled={page >= totalPages - 1 || loading}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export function buildPatientRows(items: Patient[]): PatientRow[] {
  return items.map((p) => ({
    ...p,
    age: calculateAge(p.date_of_birth),
    lastVisit: p.last_visit ?? null,
  }));
}
