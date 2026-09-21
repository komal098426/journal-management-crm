export type CsvColumn<T> = { key: keyof T | string; label: string; format?: (row: T) => unknown };

function cell(value: unknown) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  // Neutralise spreadsheet formula injection for text cells.
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T extends Record<string, unknown>>(columns: CsvColumn<T>[], rows: T[]) {
  const header = columns.map(column => cell(column.label)).join(",");
  const lines = rows.map(row =>
    columns.map(column => cell(column.format ? column.format(row) : row[column.key as keyof T])).join(","),
  );
  return `﻿${[header, ...lines].join("\r\n")}`;
}
