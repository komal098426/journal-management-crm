import { supabase } from "../config/supabase.js";
import { fromDbError, notFound } from "./errors.js";

type Result<T> = { data: T | null; error: { code?: string; message: string; details?: string | null; hint?: string | null } | null; count?: number | null };

/** Returns data or throws a safe ApiError. */
export function unwrap<T>(result: Result<T>, options: { action?: "delete"; notFoundMessage?: string } = {}): T {
  if (result.error) {
    if (result.error.code === "PGRST116") throw notFound(options.notFoundMessage);
    throw fromDbError(result.error, options);
  }
  if (result.data === null) throw notFound(options.notFoundMessage);
  return result.data;
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const result = await supabase.rpc(fn, args);
  if (result.error) throw fromDbError(result.error);
  return result.data as T;
}
