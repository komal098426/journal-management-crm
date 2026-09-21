import { env } from "../config/env.js";
import { badRequest } from "./errors.js";

export type RangePreset = "today" | "week" | "month" | "year" | "custom";
export type DateRange = { from: string; to: string; preset: RangePreset };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's calendar date (YYYY-MM-DD) in the workspace timezone. */
export function today(timeZone = env.APP_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(iso: string, days: number) {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function isValidIsoDate(value: string) {
  return ISO_DATE.test(value) && toIso(toDate(value)) === value;
}

export function resolveRange(preset: RangePreset = "month", from?: string, to?: string): DateRange {
  const current = today();
  const date = toDate(current);
  switch (preset) {
    case "today":
      return { preset, from: current, to: current };
    case "week": {
      const mondayOffset = (date.getUTCDay() + 6) % 7;
      return { preset, from: addDays(current, -mondayOffset), to: current };
    }
    case "month":
      return { preset, from: `${current.slice(0, 7)}-01`, to: current };
    case "year":
      return { preset, from: `${current.slice(0, 4)}-01-01`, to: current };
    case "custom": {
      if (!from || !to || !isValidIsoDate(from) || !isValidIsoDate(to)) {
        throw badRequest("Custom ranges need valid from and to dates (YYYY-MM-DD)");
      }
      if (from > to) throw badRequest("The start date must be on or before the end date");
      return { preset, from, to };
    }
  }
}

/** Picks a chart bucket that keeps the number of bars readable. */
export function bucketFor(range: DateRange): "day" | "week" | "month" {
  const days = (toDate(range.to).getTime() - toDate(range.from).getTime()) / 86_400_000 + 1;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}
