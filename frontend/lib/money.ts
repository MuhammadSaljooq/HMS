// Formats API money strings (e.g. "600.00") as PKR for display.
export function formatCurrency(value: string | number, currency = "PKR"): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

// Sum of API money strings, returned as a fixed-2 string (display helper only).
export function sumMoney(values: string[]): string {
  const total = values.reduce((acc, v) => acc + Number(v || 0), 0);
  return total.toFixed(2);
}

// Today's date in the clinic timezone (Asia/Karachi) as YYYY-MM-DD.
export function todayInClinicTz(): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}
