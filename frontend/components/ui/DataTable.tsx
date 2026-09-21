"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search } from "lucide-react";
import type { ReactNode } from "react";
import { ErrorState } from "./primitives";

export type Column<T> = {
  key: string;
  label: string;
  sortable?: boolean;
  numeric?: boolean;
  render?: (row: T) => ReactNode;
};

export function DataTable<T extends { id: number | string }>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  emptyMessage = "Nothing here yet.",
  sort,
  order,
  onSort,
  onRowClick,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: ReactNode;
  sort?: string;
  order?: "asc" | "desc";
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
}) {
  return (
    <div className="table-wrap">
      {error ? <div style={{ paddingTop: 16 }}><ErrorState message={error} onRetry={onRetry} /></div> : null}
      <table>
        <thead>
          <tr>
            {columns.map(column => (
              <th
                key={column.key}
                className={column.numeric ? "num" : undefined}
                aria-sort={sort === column.key ? (order === "asc" ? "ascending" : "descending") : undefined}
              >
                {column.sortable && onSort ? (
                  <button className="sort-button" onClick={() => onSort(column.key)}>
                    {column.label}
                    {sort === column.key ? (order === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />) : null}
                  </button>
                ) : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={loading && rows.length ? { opacity: 0.55 } : undefined}>
          {loading && rows.length === 0
            ? Array.from({ length: 5 }).map((_, index) => (
              <tr key={index}>
                {columns.map(column => (
                  <td key={column.key}><span className="skeleton" style={{ height: 12, width: "70%" }} /></td>
                ))}
              </tr>
            ))
            : rows.map(row => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map(column => (
                  <td key={column.key} className={column.numeric ? "num" : undefined}>
                    {column.render ? column.render(row) : String((row as unknown as Record<string, unknown>)[column.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {!loading && !error && rows.length === 0 ? <div className="empty-state">{emptyMessage}</div> : null}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <span>{start}–{end} of {total}</span>
      <div className="pager">
        <button className="secondary-button" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={12} /> Prev</button>
        <span className="mono">Page {page} / {pages}</span>
        <button className="secondary-button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <ChevronRight size={12} /></button>
      </div>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="search-box">
      <Search size={14} />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function DateRangeInputs({ from, to, onChange }: { from?: string; to?: string; onChange: (key: "from" | "to", value: string | undefined) => void }) {
  return (
    <>
      <input className="input-dark" type="date" value={from ?? ""} onChange={event => onChange("from", event.target.value || undefined)} aria-label="From date" />
      <input className="input-dark" type="date" value={to ?? ""} onChange={event => onChange("to", event.target.value || undefined)} aria-label="To date" />
    </>
  );
}
