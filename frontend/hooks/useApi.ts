"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";
import type { Paginated } from "@/types/erp";

/** Loads data with loading/error state; re-runs when `deps` change. */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef.current()
      .then(result => { if (active) setData(result); })
      .catch(err => { if (active) setError(errorMessage(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);

  const reload = useCallback(() => setVersion(value => value + 1), []);
  return { data, error, loading, reload, setData };
}

export type ListParams = {
  page: number;
  pageSize: number;
  search: string;
  sort?: string;
  order: "asc" | "desc";
  from?: string;
  to?: string;
  [filter: string]: string | number | undefined;
};

/** Server-side list state: search (debounced), filters, sorting and pagination. */
export function useList<T>(loader: (query: ListParams) => Promise<Paginated<T>>, initial: Partial<ListParams> = {}) {
  const [params, setParams] = useState<ListParams>({ page: 1, pageSize: 20, search: "", order: "desc", ...initial } as ListParams);
  const [searchInput, setSearchInput] = useState(params.search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setParams(current => (current.search === searchInput ? current : { ...current, search: searchInput, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const key = JSON.stringify(params);
  const state = useApi(() => loader(params), [key]);

  const setParam = useCallback((name: string, value: string | number | undefined) => {
    setParams(current => ({ ...current, [name]: value, page: name === "page" ? Number(value) : 1 }));
  }, []);

  const toggleSort = useCallback((column: string) => {
    setParams(current => ({
      ...current,
      sort: column,
      order: current.sort === column && current.order === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }, []);

  return {
    ...state,
    rows: state.data?.data ?? [],
    total: state.data?.total ?? 0,
    params,
    setParam,
    toggleSort,
    searchInput,
    setSearchInput,
  };
}
