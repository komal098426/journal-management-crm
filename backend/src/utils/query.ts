import { z } from "zod";
import { badRequest } from "./errors.js";
import { isValidIsoDate } from "./dates.js";

export const isoDate = z.string().refine(isValidIsoDate, "Use a valid date (YYYY-MM-DD)");

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  from: isoDate.optional(),
  to: isoDate.optional(),
  format: z.enum(["json", "csv"]).default("json"),
});
export type ListQuery = z.infer<typeof listQuerySchema>;

/** Strips characters that have meaning inside PostgREST filter strings. */
export function sanitizeSearch(value?: string) {
  if (!value) return "";
  return value.replace(/[,()*%\\:"'.]/g, " ").replace(/\s+/g, " ").trim();
}

export function pickSort(sort: string | undefined, allowed: readonly string[], fallback: string) {
  if (!sort) return fallback;
  if (!allowed.includes(sort)) throw badRequest(`Sorting by "${sort}" is not supported`);
  return sort;
}

/** Row range for a page; CSV exports fetch up to 10,000 rows in one go. */
export function pageRange(query: ListQuery) {
  if (query.format === "csv") return { start: 0, end: 9_999 };
  const start = (query.page - 1) * query.pageSize;
  return { start, end: start + query.pageSize - 1 };
}

export function paginated<T>(rows: T[], count: number | null, query: ListQuery) {
  return { data: rows, total: count ?? rows.length, page: query.page, pageSize: query.pageSize };
}

export const idParam = z.coerce.number().int().positive();
