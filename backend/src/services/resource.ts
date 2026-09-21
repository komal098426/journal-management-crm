import { supabase } from "../config/supabase.js";
import { ApiError, fromDbError, notFound } from "../utils/errors.js";
import { addDays } from "../utils/dates.js";
import { type ListQuery, pageRange, pickSort, sanitizeSearch } from "../utils/query.js";

// The Supabase client is untyped (no generated types), so builders are loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Query = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type ListOptions = {
  source: string;
  query: ListQuery;
  sortable: readonly string[];
  defaultSort: string;
  searchColumns?: string[];
  dateColumn?: string;
  /** Timestamp columns need an exclusive upper bound so the whole "to" day is included. */
  dateIsTimestamp?: boolean;
  select?: string;
  apply?: (query: Query) => Query;
};

export async function listRows(options: ListOptions): Promise<{ rows: Row[]; count: number }> {
  const build = (head: boolean) => {
    let query: Query = supabase.from(options.source).select(options.select ?? "*", { count: "exact", head });
    const search = sanitizeSearch(options.query.search);
    if (search && options.searchColumns?.length) {
      query = query.or(options.searchColumns.map(column => `${column}.ilike.*${search}*`).join(","));
    }
    if (options.dateColumn && options.query.from) query = query.gte(options.dateColumn, options.query.from);
    if (options.dateColumn && options.query.to) {
      query = options.dateIsTimestamp
        ? query.lt(options.dateColumn, addDays(options.query.to, 1))
        : query.lte(options.dateColumn, options.query.to);
    }
    return options.apply ? options.apply(query) : query;
  };

  const sort = pickSort(options.query.sort, options.sortable, options.defaultSort);
  const { start, end } = pageRange(options.query);
  const result = await build(false)
    .order(sort, { ascending: options.query.order === "asc", nullsFirst: false })
    .order("id", { ascending: false })
    .range(start, end);

  if (result.error) {
    // Asking for a page past the end: return an empty page with the real total.
    if (result.error.code === "PGRST103") {
      const head = await build(true);
      return { rows: [], count: head.count ?? 0 };
    }
    throw fromDbError(result.error);
  }
  return { rows: result.data ?? [], count: result.count ?? 0 };
}

export async function getRow(source: string, id: number | string, label: string): Promise<Row> {
  const result = await supabase.from(source).select("*").eq("id", id).maybeSingle();
  if (result.error) throw fromDbError(result.error);
  if (!result.data) throw notFound(`${label} not found`);
  return result.data;
}

export async function insertRow(table: string, values: Row): Promise<Row> {
  const result = await supabase.from(table).insert(values).select().single();
  if (result.error) throw fromDbError(result.error);
  return result.data;
}

export async function updateRow(table: string, id: number | string, values: Row, label: string): Promise<Row> {
  const result = await supabase.from(table).update(values).eq("id", id).select().maybeSingle();
  if (result.error) throw fromDbError(result.error);
  if (!result.data) throw notFound(`${label} not found`);
  return result.data;
}

export async function deleteRow(table: string, id: number | string, label: string, inUseMessage?: string) {
  const result = await supabase.from(table).delete().eq("id", id).select("id");
  if (result.error) {
    const error = fromDbError(result.error, { action: "delete" });
    if (error.code === "IN_USE" && inUseMessage) throw new ApiError(409, inUseMessage, "IN_USE");
    throw error;
  }
  if (!result.data?.length) throw notFound(`${label} not found`);
  return { id };
}

/** Standard list/get/create/update/delete for simple tables backed by an optional read view. */
export function crud(config: {
  table: string;
  view?: string;
  label: string;
  sortable: readonly string[];
  defaultSort: string;
  searchColumns: string[];
  dateColumn?: string;
  inUseMessage?: string;
}) {
  const source = config.view ?? config.table;
  return {
    list: (query: ListQuery, apply?: (q: Query) => Query) =>
      listRows({
        source, query, apply,
        sortable: config.sortable, defaultSort: config.defaultSort,
        searchColumns: config.searchColumns, dateColumn: config.dateColumn,
      }),
    get: (id: number) => getRow(source, id, config.label),
    create: async (values: Row) => {
      const row = await insertRow(config.table, values);
      return getRow(source, row.id, config.label);
    },
    update: async (id: number, values: Row) => {
      await updateRow(config.table, id, values, config.label);
      return getRow(source, id, config.label);
    },
    remove: (id: number) => deleteRow(config.table, id, config.label, config.inUseMessage),
  };
}
