"use client";

import { createContext, useContext, useMemo } from "react";

function safeCurrency(currency: string) {
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency });
    return currency;
  } catch {
    return "PKR";
  }
}

export function makeFormat(rawCurrency: string) {
  const currency = safeCurrency(rawCurrency);
  const moneyFormat = new Intl.NumberFormat("en-US", {
    style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
  const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

  return {
    currency,
    money: (value: number | string | null | undefined) => moneyFormat.format(Number(value ?? 0)).replace(/ /g, " "),
    compactMoney: (value: number | string | null | undefined) => {
      const n = Number(value ?? 0);
      return Math.abs(n) < 100_000 ? moneyFormat.format(n).replace(/ /g, " ") : `${currency} ${compact.format(n)}`;
    },
    number: (value: number | string | null | undefined) => numberFormat.format(Number(value ?? 0)),
    date: formatDate,
    dateTime: formatDateTime,
  };
}

export type Formatters = ReturnType<typeof makeFormat>;

const FormatContext = createContext<Formatters>(makeFormat("PKR"));

export function FormatProvider({ currency, children }: { currency: string; children: React.ReactNode }) {
  const value = useMemo(() => makeFormat(currency), [currency]);
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

export const useFormat = () => useContext(FormatContext);

/** "2026-09-09" → "09 Sep 2026" (date-only values are not shifted by timezone). */
export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", ...(value.length === 10 ? { timeZone: "UTC" } : {}),
  }).format(date);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Today's date (YYYY-MM-DD) in the browser's timezone. */
export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "card", label: "Card" },
  { value: "online_transfer", label: "Online Transfer" },
] as const;

export const EXPENSE_CATEGORIES = [
  "rent", "electricity", "internet", "salaries", "transport", "maintenance", "marketing", "other",
] as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  sales_staff: "Sales Staff",
  inventory_staff: "Inventory Staff",
};

export function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  const text = value.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
