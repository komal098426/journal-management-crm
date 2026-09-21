import type { z } from "zod";
import { badRequest } from "../utils/errors.js";

/** Parses input with a zod schema, throwing a 400 with per-field messages. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues.map(issue => ({ field: issue.path.join("."), message: issue.message }));
  const first = details[0];
  const message = first ? (first.field ? `${labelFor(first.field)}: ${first.message}` : first.message) : "Invalid request";
  throw badRequest(message, details);
}

function labelFor(path: string) {
  return path
    .replace(/\.(\d+)\./g, (_, index) => ` line ${Number(index) + 1} `)
    .replace(/_/g, " ")
    .replace(/^\w/, char => char.toUpperCase());
}
