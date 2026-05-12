"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type AppointmentCalendarProps = {
  /** First day of the visible month (time ignored). */
  month: Date;
  onMonthChange: (firstOfMonth: Date) => void;
  selectedDate: string;
  onSelectDate: (ymd: string) => void;
  markedDates: Set<string>;
  /** When true, omit outer Card — parent provides themed surface (e.g. dashboard dataCard). */
  embedded?: boolean;
};

export function AppointmentCalendar({
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  markedDates,
  embedded = false,
}: AppointmentCalendarProps) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const cells: { day: number | null; ymd: string | null }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ day: null, ymd: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${y}-${pad(m + 1)}-${pad(d)}`;
    cells.push({ day: d, ymd });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, ymd: null });

  function prevMonth() {
    onMonthChange(new Date(y, m - 1, 1));
  }
  function nextMonth() {
    onMonthChange(new Date(y, m + 1, 1));
  }

  const label = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  const body = (
    <>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (cell.day == null || cell.ymd == null) {
            return <div key={`e-${idx}`} className="aspect-square" />;
          }
          const ymd: string = cell.ymd;
          const marked = markedDates.has(ymd);
          const selected = selectedDate === ymd;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelectDate(ymd)}
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-md border text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-transparent hover:bg-muted",
              )}
            >
              {cell.day}
              {marked && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </>
  );

  if (embedded) {
    return body;
  }

  return (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Calendar</CardTitle>
          <CardDescription>Days with dots have appointments. Select a day to filter the table.</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={prevMonth} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-medium">{label}</span>
          <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={nextMonth} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
