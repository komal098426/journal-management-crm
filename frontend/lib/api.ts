"use client";

import { BACKEND_DISABLED, offlineGet } from "./offline";
import { getSupabase } from "./supabase";

export type FieldError = { field: string; message: string };

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: FieldError[],
  ) {
    super(message);
  }
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api").replace(/\/$/, "");

type QueryValue = string | number | boolean | null | undefined;
type RequestOptions = { method?: string; body?: unknown; query?: Record<string, QueryValue>; asBlob?: boolean };

async function accessToken() {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (BACKEND_DISABLED) {
    const method = options.method ?? "GET";
    if (method !== "GET" || options.asBlob) {
      throw new ApiRequestError(503, "The backend is disabled, so changes cannot be saved.", "BACKEND_DISABLED");
    }
    try {
      return offlineGet(path, options.query) as T;
    } catch (error) {
      throw new ApiRequestError(503, error instanceof Error ? error.message : "Backend disabled", "BACKEND_DISABLED");
    }
  }

  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiRequestError(0, "Cannot reach the ERP server. Check your connection and that the backend is running.", "NETWORK");
  }

  if (!response.ok) {
    let payload: { error?: { message?: string; code?: string; details?: FieldError[] } } | null = null;
    try {
      payload = await response.json();
    } catch {
      /* non-JSON error body */
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new Event("erp:unauthorized"));
    }
    throw new ApiRequestError(
      response.status,
      payload?.error?.message ?? `Request failed (${response.status})`,
      payload?.error?.code,
      payload?.error?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  if (options.asBlob) return (await response.blob()) as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>) => apiFetch<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body: body ?? {} }),
  put: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: (path: string) => apiFetch<void>(path, { method: "DELETE" }),
};

/** Downloads an authenticated file (e.g. a CSV export). */
export async function downloadFile(path: string, query: Record<string, QueryValue>, filename: string) {
  const blob = await apiFetch<Blob>(path, { query, asBlob: true });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
