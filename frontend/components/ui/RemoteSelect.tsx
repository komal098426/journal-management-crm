"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";

/** A select whose options are searched on the server (customers, suppliers, products…). */
export function RemoteSelect<T extends { id: number }>({
  load,
  value,
  onChange,
  getLabel,
  noun,
  required,
  disabled,
  emptyLabel,
  initialOption,
  compact,
}: {
  load: (search: string) => Promise<T[]>;
  value: number | null;
  onChange: (id: number | null, item: T | null) => void;
  getLabel: (item: T) => string;
  noun: string;
  required?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
  initialOption?: T | null;
  compact?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<T[]>(initialOption ? [initialOption] : []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const selectedRef = useRef<T | null>(initialOption ?? null);

  useEffect(() => {
    if (initialOption && !options.some(option => option.id === initialOption.id)) {
      setOptions(current => [initialOption, ...current]);
    }
    if (initialOption) selectedRef.current = initialOption;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOption?.id]);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await loadRef.current(search);
        if (!active) return;
        const selected = selectedRef.current;
        setOptions(selected && !rows.some(row => row.id === selected.id) ? [selected, ...rows] : rows);
        setError(null);
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: compact ? "minmax(70px, .8fr) minmax(0, 1.6fr)" : "1fr", gap: 6 }}>
      <input
        className="input-dark"
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder={`Search ${noun}…`}
        disabled={disabled}
        aria-label={`Search ${noun}`}
      />
      <select
        className="select-dark"
        value={value ?? ""}
        required={required}
        disabled={disabled}
        aria-label={`Select ${noun}`}
        onChange={event => {
          const id = event.target.value ? Number(event.target.value) : null;
          const item = options.find(option => option.id === id) ?? null;
          selectedRef.current = item;
          onChange(id, item);
        }}
      >
        <option value="">{loading ? "Loading…" : emptyLabel ?? `Select ${noun}`}</option>
        {options.map(option => <option key={option.id} value={option.id}>{getLabel(option)}</option>)}
      </select>
      {error ? <span className="panel-subtitle danger-text" style={{ gridColumn: "1 / -1" }}>{error}</span> : null}
    </div>
  );
}
