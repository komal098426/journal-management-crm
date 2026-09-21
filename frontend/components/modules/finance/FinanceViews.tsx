"use client";

import { Download, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PartyPaymentModal } from "@/components/modules/parties/PartyViews";
import { DataTable, DateRangeInputs, Pagination, SearchBox, type Column } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/Modal";
import { RemoteSelect } from "@/components/ui/RemoteSelect";
import { ConfirmDelete, RowActions } from "@/components/ui/RowActions";
import { Field, PanelHeader, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useApi, useList } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { downloadFile, errorMessage } from "@/lib/api";
import { EXPENSE_CATEGORIES, formatDate, PAYMENT_METHODS, titleCase, todayIso, useFormat } from "@/lib/format";
import { expenseService, paymentService, purchaseReturnService, purchaseService, reportService, saleService, salesReturnService } from "@/services/erp";
import type { Expense, Paginated, Payment, Purchase, PurchaseReturn, ReportResult, ReportType, Sale, SalesReturn } from "@/types/erp";

function SummaryGrid({ items }: { items: ReportResult["summary"] | undefined }) {
  const fmt = useFormat();
  if (!items) return <div className="detail-grid">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="mini-metric"><span className="skeleton" style={{ height: 22 }} /></div>)}</div>;
  return (
    <div className="detail-grid">
      {items.map(item => (
        <div key={item.label} className="mini-metric">
          <span>{item.label}</span>
          <b className={item.type === "money" && item.value < 0 ? "danger-text" : undefined}>
            {item.type === "money" ? fmt.money(item.value) : item.type === "percent" ? `${item.value}%` : fmt.number(item.value)}
          </b>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments (Finance)
// ---------------------------------------------------------------------------
export function PaymentsView() {
  const { can } = useAuth();
  const fmt = useFormat();
  const partyTabs = useMemo(() => [
    { value: "", label: "All payments", show: true },
    { value: "customer", label: "Customer receipts", show: can("sales:read", "finance:read") },
    { value: "supplier", label: "Supplier payments", show: can("purchases:read", "finance:read") },
    { value: "expense", label: "Expense payments", show: can("expenses:read", "finance:read") },
  ].filter(tab => tab.show), [can]);
  const list = useList<Payment>(query => paymentService.list(query), { sort: "payment_date" });
  const summary = useApi<ReportResult | null>(
    () => (can("finance:read")
      ? reportService.run("payments", { pageSize: 1, from: list.params.from, to: list.params.to, party_type: list.params.party_type, direction: list.params.direction })
      : Promise.resolve(null)),
    [list.data],
  );
  const payableTypes = [...(can("sales:write") ? ["customer" as const] : []), ...(can("purchases:write") ? ["supplier" as const] : [])];
  const [open, setOpen] = useState(false);

  const columns: Column<Payment>[] = [
    { key: "payment_date", label: "Date", sortable: true, render: p => <span className="mono">{formatDate(p.payment_date)}</span> },
    {
      key: "party_name", label: "Party", sortable: true,
      render: p => {
        const href = p.customer_id ? `/customers/${p.customer_id}` : p.supplier_id ? `/suppliers/${p.supplier_id}` : p.expense_id ? "/expenses" : null;
        return <div className="person-cell"><div>{href ? <Link className="link" href={href}>{p.party_name}</Link> : <b>{p.party_name}</b>}<span>{titleCase(p.party_type)}{p.expense_category ? ` · ${titleCase(p.expense_category)}` : ""}</span></div></div>;
      },
    },
    { key: "direction", label: "Flow", render: p => <StatusBadge status={p.direction} label={p.direction === "in" ? "Money in" : "Money out"} /> },
    { key: "payment_method", label: "Method", render: p => titleCase(p.payment_method) },
    { key: "reference", label: "Reference", render: p => <div className="person-cell"><div><b>{p.reference ?? "—"}</b><span>{p.notes ?? ""}</span></div></div> },
    { key: "amount", label: "Amount", sortable: true, numeric: true, render: p => <b className={p.direction === "out" ? "danger-text" : "positive-text"}>{p.direction === "out" ? "−" : "+"}{fmt.money(p.amount)}</b> },
  ];

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title="Finance · payments"
        subtitle="Every receipt, supplier payment, refund and expense payment — the cash & bank ledger"
        actions={payableTypes.length ? <button className="primary-button" onClick={() => setOpen(true)}><Plus size={14} /> Record payment</button> : null}
      />
      <nav className="page-tabs" aria-label="Payment types">
        {partyTabs.map(tab => (
          <button key={tab.value} className={`nav-pill ${(list.params.party_type ?? "") === tab.value ? "active" : ""}`} onClick={() => list.setParam("party_type", tab.value || undefined)}>{tab.label}</button>
        ))}
      </nav>
      {can("finance:read") ? <SummaryGrid items={summary.data?.summary} /> : null}
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search party, reference or notes" />
        <select className="select-dark" value={list.params.direction ?? ""} onChange={e => list.setParam("direction", e.target.value || undefined)} aria-label="Direction">
          <option value="">In & out</option>
          <option value="in">Money in</option>
          <option value="out">Money out</option>
        </select>
        <select className="select-dark" value={list.params.payment_method ?? ""} onChange={e => list.setParam("payment_method", e.target.value || undefined)} aria-label="Method">
          <option value="">All methods</option>
          {PAYMENT_METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <DateRangeInputs from={list.params.from} to={list.params.to} onChange={list.setParam} />
      </div>
      <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort} emptyMessage="No payments match these filters." />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {open && <PartyPaymentModal partyTypes={payableTypes} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); list.reload(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
export function ExpensesView() {
  const { can } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const list = useList<Expense>(query => expenseService.list(query), { sort: "expense_date" });
  const summary = useApi<ReportResult | null>(
    () => (can("finance:read")
      ? reportService.run("expenses", { pageSize: 1, from: list.params.from, to: list.params.to, category: list.params.category })
      : Promise.resolve(null)),
    [list.data],
  );
  const [editing, setEditing] = useState<Expense | "new" | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title="Expenses"
        subtitle="Operating expenses reduce cash and net profit as soon as they are recorded"
        actions={can("expenses:write") ? <button className="primary-button" onClick={() => setEditing("new")}><Plus size={14} /> Add expense</button> : null}
      />
      {can("finance:read") ? <SummaryGrid items={summary.data?.summary.slice(0, 4)} /> : null}
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search expenses" />
        <select className="select-dark" value={list.params.category ?? ""} onChange={e => list.setParam("category", e.target.value || undefined)} aria-label="Category">
          <option value="">All categories</option>
          {EXPENSE_CATEGORIES.map(category => <option key={category} value={category}>{titleCase(category)}</option>)}
        </select>
        <DateRangeInputs from={list.params.from} to={list.params.to} onChange={list.setParam} />
      </div>
      <DataTable<Expense>
        columns={[
          { key: "expense_date", label: "Date", sortable: true, render: e => <span className="mono">{formatDate(e.expense_date)}</span> },
          { key: "title", label: "Expense", sortable: true, render: e => <div className="person-cell"><div><b>{e.title}</b><span>{e.description ?? ""}</span></div></div> },
          { key: "category", label: "Category", sortable: true, render: e => <StatusBadge status="pending" label={titleCase(e.category)} /> },
          { key: "payment_method", label: "Method", render: e => titleCase(e.payment_method) },
          { key: "receipt", label: "Receipt", render: e => (e.receipt ? (/^https?:\/\//.test(e.receipt) ? <a className="link" href={e.receipt} target="_blank" rel="noreferrer">View</a> : e.receipt) : "—") },
          { key: "amount", label: "Amount", sortable: true, numeric: true, render: e => <b>{fmt.money(e.amount)}</b> },
          { key: "actions", label: "", render: e => <RowActions label={e.title} onEdit={can("expenses:write") ? () => setEditing(e) : undefined} onDelete={can("expenses:write") ? () => setDeleting(e) : undefined} /> },
        ]}
        rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort}
        emptyMessage="No expenses recorded for these filters."
      />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {editing && (
        <FormModal
          title={editing === "new" ? "Add expense" : `Edit ${editing.title}`}
          description="The payment is recorded in the cash & bank ledger automatically."
          submitLabel="Save expense"
          onClose={() => setEditing(null)}
          onSubmit={async form => {
            const body = {
              title: form.get("title"), category: form.get("category"), amount: Number(form.get("amount")),
              payment_method: form.get("payment_method"), expense_date: form.get("expense_date"),
              description: form.get("description"), receipt: form.get("receipt"),
            };
            if (editing === "new") await expenseService.create(body); else await expenseService.update(editing.id, body);
            toast("Expense saved");
            setEditing(null);
            list.reload();
          }}
        >
          <div className="form-grid">
            <Field label="Title" full><input className="input-dark" name="title" defaultValue={editing === "new" ? "" : editing.title} required maxLength={160} placeholder="e.g. September office rent" /></Field>
            <Field label="Category">
              <select className="select-dark" name="category" defaultValue={editing === "new" ? "rent" : editing.category}>
                {EXPENSE_CATEGORIES.map(category => <option key={category} value={category}>{titleCase(category)}</option>)}
              </select>
            </Field>
            <Field label="Amount"><input className="input-dark" name="amount" type="number" min="0.01" step="0.01" defaultValue={editing === "new" ? "" : editing.amount} required /></Field>
            <Field label="Payment method">
              <select className="select-dark" name="payment_method" defaultValue={editing === "new" ? "cash" : editing.payment_method}>
                {PAYMENT_METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Date"><input className="input-dark" name="expense_date" type="date" defaultValue={editing === "new" ? todayIso() : editing.expense_date} required /></Field>
            <Field label="Receipt (URL or reference)" full><input className="input-dark" name="receipt" defaultValue={editing === "new" ? "" : editing.receipt ?? ""} maxLength={500} /></Field>
            <Field label="Description" full><textarea className="textarea-dark" name="description" defaultValue={editing === "new" ? "" : editing.description ?? ""} maxLength={1000} /></Field>
          </div>
        </FormModal>
      )}
      {deleting && (
        <ConfirmDelete title={`Delete ${deleting.title}?`} message="The expense and its payment record are removed, and profit & loss is recalculated."
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await expenseService.remove(deleting.id); toast("Expense deleted"); setDeleting(null); list.reload(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------
type ReturnRow = SalesReturn | PurchaseReturn;

export function ReturnsView() {
  const { can } = useAuth();
  const fmt = useFormat();
  const router = useRouter();
  const [tab, setTab] = useState<"sales" | "purchases">(can("sales:read") ? "sales" : "purchases");
  const isSales = tab === "sales";
  const list = useList<ReturnRow>(
    query => (isSales ? salesReturnService.list(query) : purchaseReturnService.list(query)) as Promise<Paginated<ReturnRow>>,
    { sort: "return_date" },
  );
  useEffect(() => { list.reload(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const [choosing, setChoosing] = useState(false);
  const [invoiceId, setInvoiceId] = useState<number | null>(null);

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title="Returns"
        subtitle={isSales ? "Sales returns put stock back and reduce revenue and receivables" : "Purchase returns remove stock and reduce purchases and payables"}
        actions={can(isSales ? "sales:write" : "purchases:write") ? <button className="primary-button" onClick={() => { setInvoiceId(null); setChoosing(true); }}><Plus size={14} /> New {isSales ? "sales" : "purchase"} return</button> : null}
      />
      <nav className="page-tabs" aria-label="Return types">
        {can("sales:read") ? <button className={`nav-pill ${isSales ? "active" : ""}`} onClick={() => setTab("sales")}>Sales returns</button> : null}
        {can("purchases:read") ? <button className={`nav-pill ${!isSales ? "active" : ""}`} onClick={() => setTab("purchases")}>Purchase returns</button> : null}
      </nav>
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder={`Search return, invoice or ${isSales ? "customer" : "supplier"}`} />
        <DateRangeInputs from={list.params.from} to={list.params.to} onChange={list.setParam} />
      </div>
      <DataTable<ReturnRow>
        columns={[
          { key: "return_number", label: "Return", sortable: true, render: r => <b>{r.return_number}</b> },
          { key: "return_date", label: "Date", sortable: true, render: r => <span className="mono">{formatDate(r.return_date)}</span> },
          {
            key: "invoice_number", label: "Invoice", sortable: true,
            render: r => <Link className="link" href={"sale_id" in r ? `/sales/${r.sale_id}` : `/purchases/${r.purchase_id}`}>{r.invoice_number}</Link>,
          },
          { key: isSales ? "customer_name" : "supplier_name", label: isSales ? "Customer" : "Supplier", sortable: true, render: r => ("customer_name" in r ? r.customer_name : r.supplier_name) },
          { key: "total_amount", label: "Amount", sortable: true, numeric: true, render: r => <b>{fmt.money(r.total_amount)}</b> },
          { key: "adjusted", label: isSales ? "Receivable reduced" : "Payable reduced", numeric: true, render: r => fmt.money("receivable_adjusted" in r ? r.receivable_adjusted : r.payable_adjusted) },
          { key: "refund_amount", label: "Refunded", sortable: true, numeric: true, render: r => (r.refund_amount > 0 ? `${fmt.money(r.refund_amount)} · ${titleCase(r.refund_method)}` : "—") },
          { key: "reason", label: "Reason", render: r => r.reason ?? "—" },
        ]}
        rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort}
        emptyMessage="No returns recorded."
      />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {choosing && (
        <FormModal
          eyebrow="New return"
          title={`Choose the ${isSales ? "sale" : "purchase"}`}
          description="You will pick the items and quantities on the invoice page."
          submitLabel="Continue"
          onClose={() => setChoosing(false)}
          onSubmit={async () => {
            if (!invoiceId) throw new Error("Select an invoice");
            router.push(`/${isSales ? "sales" : "purchases"}/${invoiceId}?return=1`);
          }}
        >
          <Field label="Invoice" full>
            <RemoteSelect<Sale | Purchase>
              load={search => (isSales
                ? (saleService.list({ search, pageSize: 50 }) as Promise<Paginated<Sale | Purchase>>)
                : (purchaseService.list({ search, pageSize: 50 }) as Promise<Paginated<Sale | Purchase>>))
                .then(r => r.data.filter(invoice => invoice.status !== "cancelled" && invoice.status !== "returned"))}
              value={invoiceId}
              onChange={id => setInvoiceId(id)}
              getLabel={invoice => `${invoice.invoice_number} · ${"customer_name" in invoice ? invoice.customer_name : invoice.supplier_name} · ${fmt.money(invoice.total)}`}
              noun="invoice"
              required
            />
          </Field>
        </FormModal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
const SORTABLE: Record<ReportType, string[]> = {
  sales: ["invoice_number", "sale_date", "customer_name", "total", "paid_amount", "remaining_amount", "status"],
  purchases: ["invoice_number", "purchase_date", "supplier_name", "total", "paid_amount", "remaining_amount", "status"],
  inventory: ["sku", "name", "category_name", "stock_quantity", "minimum_stock", "purchase_price", "selling_price", "stock_value"],
  customers: ["name", "total_sales", "total_paid", "balance"],
  suppliers: ["name", "total_purchases", "total_paid", "balance"],
  expenses: ["expense_date", "title", "category", "amount"],
  payments: ["payment_date", "party_name", "amount"],
  "profit-loss": [],
};

type ReportRow = ReportResult["rows"][number];
type Params = Record<string, string | number | undefined>;

export function ReportsView() {
  const fmt = useFormat();
  const toast = useToast();
  const types = useApi(() => reportService.types(), []);
  const [type, setType] = useState<ReportType | null>(null);
  const [params, setParams] = useState<Params>({ page: 1, pageSize: 20 });
  const [searchInput, setSearchInput] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!type && types.data?.data.length) setType(types.data.data[0].type);
  }, [types.data, type]);
  useEffect(() => {
    const timer = setTimeout(() => setParams(current => ((current.search ?? "") === searchInput ? current : { ...current, search: searchInput || undefined, page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const report = useApi<ReportResult | null>(() => (type ? reportService.run(type, params) : Promise.resolve(null)), [type, JSON.stringify(params)]);
  const set = (key: string, value: string | number | undefined) => setParams(current => ({ ...current, [key]: value, page: key === "page" ? value : 1 }));
  const switchType = (next: ReportType) => {
    setType(next);
    setParams(current => ({ page: 1, pageSize: 20, from: current.from, to: current.to }));
    setSearchInput("");
  };

  const columns: Column<ReportRow>[] = (report.data?.columns ?? []).map(column => ({
    key: column.key,
    label: column.label,
    numeric: column.type === "money" || column.type === "number",
    sortable: type ? SORTABLE[type].includes(column.key) : false,
    render: row => {
      const value = row[column.key];
      switch (column.type) {
        case "money": return <span className={Number(value) < 0 ? "danger-text" : undefined}>{fmt.money(value as number)}</span>;
        case "number": return fmt.number(value as number);
        case "date": return <span className="mono">{formatDate(String(value ?? ""))}</span>;
        case "status": return <StatusBadge status={String(value ?? "")} />;
        default: return value === null || value === undefined || value === "" ? "—" : String(value);
      }
    },
  }));

  const select = (key: string, label: string, options: [string, string][]) => (
    <select className="select-dark" value={String(params[key] ?? "")} onChange={e => set(key, e.target.value || undefined)} aria-label={label}>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  );

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title="Reports & analytics"
        subtitle="Every figure is calculated from recorded transactions"
        actions={type ? (
          <button className="secondary-button" disabled={exporting} onClick={async () => {
            setExporting(true);
            try {
              await downloadFile(`/reports/${type}`, { ...params, page: undefined, pageSize: undefined, format: "csv" }, `${type}-report.csv`);
            } catch (error) {
              toast(errorMessage(error), "error");
            } finally {
              setExporting(false);
            }
          }}><Download size={13} /> {exporting ? "Exporting…" : "Export CSV"}</button>
        ) : null}
      />
      <nav className="page-tabs" aria-label="Report types">
        {types.data?.data.map(item => (
          <button key={item.type} className={`nav-pill ${type === item.type ? "active" : ""}`} onClick={() => switchType(item.type)}>{item.title}</button>
        ))}
      </nav>
      {types.error ? <div className="error-state">{types.error}</div> : null}
      {types.data && types.data.data.length === 0 ? <div className="empty-state">Your role does not include any reports.</div> : null}
      {type ? (
        <>
          <div className="toolbar">
            {type !== "profit-loss" ? <SearchBox value={searchInput} onChange={setSearchInput} placeholder="Search this report" /> : null}
            {type === "sales" || type === "purchases"
              ? select("status", "Status", [["", "All statuses"], ...["paid", "partial", "unpaid", "returned", "cancelled"].map(s => [s, titleCase(s)] as [string, string])])
              : null}
            {type === "inventory" ? select("stock_status", "Stock status", [["", "Any stock level"], ["in_stock", "In stock"], ["low_stock", "Low stock"], ["out_of_stock", "Out of stock"]]) : null}
            {type === "customers" || type === "suppliers"
              ? select("balance", "Balance", [["", "All balances"], ["outstanding", "Outstanding"], ["clear", "Settled"], ["credit", "In credit"]])
              : null}
            {type === "expenses" ? select("category", "Category", [["", "All categories"], ...EXPENSE_CATEGORIES.map(c => [c, titleCase(c)] as [string, string])]) : null}
            {type === "payments" ? (
              <>
                {select("party_type", "Party type", [["", "All parties"], ["customer", "Customers"], ["supplier", "Suppliers"], ["expense", "Expenses"]])}
                {select("direction", "Direction", [["", "In & out"], ["in", "Money in"], ["out", "Money out"]])}
              </>
            ) : null}
            {type !== "inventory" && type !== "customers" && type !== "suppliers" ? (
              <DateRangeInputs from={params.from as string | undefined} to={params.to as string | undefined} onChange={set} />
            ) : null}
          </div>
          <div style={{ paddingTop: 16 }}><SummaryGrid items={report.data?.summary} /></div>
          <DataTable<ReportRow>
            columns={columns}
            rows={report.data?.rows ?? []}
            loading={report.loading}
            error={report.error}
            onRetry={report.reload}
            sort={params.sort as string | undefined}
            order={(params.order as "asc" | "desc" | undefined) ?? "desc"}
            onSort={key => setParams(current => ({ ...current, sort: key, order: current.sort === key && current.order === "desc" ? "asc" : "desc", page: 1 }))}
            emptyMessage="No records for this report and range."
          />
          {report.data?.paginated ? (
            <Pagination page={Number(params.page)} pageSize={Number(params.pageSize)} total={report.data.total} onPage={page => set("page", page)} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
