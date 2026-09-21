"use client";

import { Pencil, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DataTable, Pagination, SearchBox, type Column } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/Modal";
import { RemoteSelect } from "@/components/ui/RemoteSelect";
import { ConfirmDelete, RowActions } from "@/components/ui/RowActions";
import { Avatar, ErrorState, Field, LoadingState, PanelHeader, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useApi, useList } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, PAYMENT_METHODS, titleCase, todayIso, useFormat } from "@/lib/format";
import { customerService, paymentService, supplierService } from "@/services/erp";
import type { Customer, CustomerDetail, OpenInvoice, Paginated, PartyTransaction, Supplier, SupplierDetail } from "@/types/erp";

type Kind = "customer" | "supplier";
type Party = Customer | Supplier;

const copy = (kind: Kind) => kind === "customer"
  ? { title: "Customers", noun: "customer", base: "/customers", totalKey: "total_sales", totalLabel: "Total sales", balanceLabel: "Receivable", write: "customers:write" as const, remove: "customers:delete" as const, pay: "sales:write" as const, invoiceBase: "/sales", newInvoice: "New sale" }
  : { title: "Suppliers", noun: "supplier", base: "/suppliers", totalKey: "total_purchases", totalLabel: "Total purchases", balanceLabel: "Payable", write: "suppliers:write" as const, remove: "suppliers:delete" as const, pay: "purchases:write" as const, invoiceBase: "/purchases", newInvoice: "New purchase" };

const service = (kind: Kind) => (kind === "customer" ? customerService : supplierService);
const loadList = (kind: Kind, query: Record<string, string | number | undefined>) =>
  service(kind).list(query) as Promise<Paginated<Party>>;
const loadDetail = (kind: Kind, id: number) =>
  service(kind).get(id) as Promise<CustomerDetail | SupplierDetail>;
const totalOf = (party: Party, kind: Kind) => ("total_sales" in party && kind === "customer" ? party.total_sales : (party as Supplier).total_purchases);

export function PartyList({ kind }: { kind: Kind }) {
  const c = copy(kind);
  const { can } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const router = useRouter();
  const list = useList<Party>(query => loadList(kind, query), { sort: "name", order: "asc" });
  const [editing, setEditing] = useState<Party | "new" | null>(null);
  const [deleting, setDeleting] = useState<Party | null>(null);

  const columns: Column<Party>[] = [
    { key: "name", label: titleCase(c.noun), sortable: true, render: p => <div className="person-cell"><Avatar name={p.name} /><div><b>{p.name}</b><span>{[p.phone, p.email].filter(Boolean).join(" · ") || "No contact details"}</span></div></div> },
    { key: c.totalKey, label: c.totalLabel, sortable: true, numeric: true, render: p => fmt.money(totalOf(p, kind)) },
    { key: "total_paid", label: "Paid", sortable: true, numeric: true, render: p => fmt.money(p.total_paid) },
    { key: "balance", label: c.balanceLabel, sortable: true, numeric: true, render: p => <b className={p.balance > 0 ? "danger-text" : p.balance < 0 ? "positive-text" : undefined}>{fmt.money(p.balance)}</b> },
    { key: "actions", label: "", render: p => <RowActions label={p.name} onEdit={can(c.write) ? () => setEditing(p) : undefined} onDelete={can(c.remove) ? () => setDeleting(p) : undefined} /> },
  ];

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title={c.title}
        subtitle={`${list.total} ${c.noun}s · balances update automatically from ${kind === "customer" ? "sales, returns and payments" : "purchases, returns and payments"}`}
        actions={can(c.write) ? <button className="primary-button" onClick={() => setEditing("new")}><Plus size={14} /> Add {c.noun}</button> : null}
      />
      <div className="toolbar">
        <SearchBox value={list.searchInput} onChange={list.setSearchInput} placeholder="Search name, phone or email" />
        <select className="select-dark" value={list.params.balance ?? ""} onChange={e => list.setParam("balance", e.target.value || undefined)} aria-label="Balance">
          <option value="">All balances</option>
          <option value="outstanding">Outstanding</option>
          <option value="clear">Settled</option>
          <option value="credit">In credit</option>
        </select>
      </div>
      <DataTable columns={columns} rows={list.rows} loading={list.loading} error={list.error} onRetry={list.reload}
        sort={list.params.sort} order={list.params.order} onSort={list.toggleSort}
        onRowClick={p => router.push(`${c.base}/${p.id}`)}
        emptyMessage={list.params.search ? `No ${c.noun}s match this search.` : `No ${c.noun}s yet.`} />
      <Pagination page={list.params.page} pageSize={list.params.pageSize} total={list.total} onPage={page => list.setParam("page", page)} />
      {editing && <PartyModal kind={kind} party={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={saved => { toast(`${saved.name} saved`); setEditing(null); list.reload(); }} />}
      {deleting && (
        <ConfirmDelete title={`Delete ${deleting.name}?`} message={`${titleCase(c.noun)}s with transactions cannot be deleted.`}
          onClose={() => setDeleting(null)}
          onConfirm={async () => { await service(kind).remove(deleting.id); toast(`${deleting.name} deleted`); setDeleting(null); list.reload(); }} />
      )}
    </div>
  );
}

function PartyModal({ kind, party, onClose, onSaved }: { kind: Kind; party: Party | null; onClose: () => void; onSaved: (party: Party) => void }) {
  const c = copy(kind);
  return (
    <FormModal
      title={party ? `Edit ${party.name}` : `Add ${c.noun}`}
      description="Balances are calculated from transactions and cannot be edited here."
      submitLabel={`Save ${c.noun}`}
      onClose={onClose}
      onSubmit={async form => {
        const body = { name: form.get("name"), phone: form.get("phone"), email: form.get("email"), address: form.get("address") };
        const saved = party ? await service(kind).update(party.id, body) : await service(kind).create(body);
        onSaved(saved as Party);
      }}
    >
      <div className="form-grid">
        <Field label="Name" full><input className="input-dark" name="name" defaultValue={party?.name} required maxLength={120} /></Field>
        <Field label="Phone"><input className="input-dark" name="phone" defaultValue={party?.phone ?? ""} maxLength={40} /></Field>
        <Field label="Email"><input className="input-dark" name="email" type="email" defaultValue={party?.email ?? ""} /></Field>
        <Field label="Address" full><textarea className="textarea-dark" name="address" defaultValue={party?.address ?? ""} maxLength={300} /></Field>
      </div>
    </FormModal>
  );
}

const TX_STATUS: Record<PartyTransaction["type"], string> = { sale: "partial", purchase: "partial", payment: "paid", refund: "cancelled", return: "pending" };

export function PartyDetailView({ kind, id }: { kind: Kind; id: number }) {
  const c = copy(kind);
  const { can } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => loadDetail(kind, id), [id, kind]);
  const [modal, setModal] = useState<"edit" | "payment" | null>(null);

  if (loading && !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><LoadingState /></div>;
  if (error || !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;

  const supplier = kind === "supplier" ? (data as SupplierDetail) : null;
  const total = totalOf(data, kind);

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{titleCase(c.noun)} · since {formatDate(data.created_at)}</div>
          <h1>{data.name}</h1>
          <p>{[data.phone, data.email, data.address].filter(Boolean).join(" · ") || "No contact details"}</p>
        </div>
        <div className="heading-actions" style={{ flexWrap: "wrap" }}>
          {can(c.write) ? <button className="secondary-button" onClick={() => setModal("edit")}><Pencil size={13} /> Edit</button> : null}
          {can(c.pay) ? <Link className="secondary-button" href={`${c.invoiceBase}/new?${c.noun}=${data.id}`}><Plus size={13} /> {c.newInvoice}</Link> : null}
          {can(c.pay) && data.balance > 0 ? <button className="primary-button" onClick={() => setModal("payment")}><Wallet size={14} /> Record payment</button> : null}
        </div>
      </div>

      <div className="stats-grid">
        <div className="glass-card stat-card"><div className="stat-label">{c.totalLabel}</div><div className="stat-value">{fmt.compactMoney(total)}</div><div className="stat-foot">{data.summary.invoices} invoices</div></div>
        <div className="glass-card stat-card"><div className="stat-label">Paid</div><div className="stat-value">{fmt.compactMoney(data.total_paid)}</div><div className="stat-foot">net of refunds</div></div>
        <div className="glass-card stat-card"><div className="stat-label">Outstanding {c.balanceLabel.toLowerCase()}</div><div className="stat-value" style={{ color: data.balance > 0 ? "#9a5e57" : undefined }}>{fmt.compactMoney(data.balance)}</div><div className="stat-foot">{data.open_invoices.length} open invoice(s)</div></div>
        <div className="glass-card stat-card"><div className="stat-label">Returns</div><div className="stat-value">{fmt.compactMoney(data.summary.returns)}</div><div className="stat-foot">total returned value</div></div>
      </div>

      <div className="content-grid">
        <div className="panel data-panel">
          <div style={{ padding: "20px 20px 0" }}><PanelHeader title="Transaction history" subtitle="Invoices, payments, refunds and returns — newest first" /></div>
          <DataTable<PartyTransaction>
            columns={[
              { key: "date", label: "Date", render: t => <span className="mono">{formatDate(t.date)}</span> },
              { key: "type", label: "Type", render: t => <StatusBadge status={TX_STATUS[t.type]} label={titleCase(t.type)} /> },
              { key: "reference", label: "Reference", render: t => (t.link ? <Link className="link" href={`/${t.link.kind === "sale" ? "sales" : "purchases"}/${t.link.id}`}>{t.reference}</Link> : t.reference) },
              { key: "description", label: "Details", render: t => titleCase(t.description) },
              { key: "amount", label: "Amount", numeric: true, render: t => fmt.money(t.amount) },
              { key: "status", label: "Status", render: t => (t.status ? <StatusBadge status={t.status} /> : "—") },
            ]}
            rows={data.transactions}
            emptyMessage="No transactions yet."
          />
        </div>
        <div className="stack">
          <div className="panel">
            <PanelHeader title="Open invoices" subtitle="Payments apply to the oldest first unless you choose one" />
            {data.open_invoices.length === 0 ? <div className="panel-subtitle">Nothing outstanding.</div> : null}
            {data.open_invoices.map(invoice => (
              <div key={invoice.id} className="totals-row">
                <Link className="link" href={`${c.invoiceBase}/${invoice.id}`}>{invoice.invoice_number}</Link>
                <span className="mono">{formatDate(invoice.date)}</span>
                <b className="danger-text">{fmt.money(invoice.remaining)}</b>
              </div>
            ))}
          </div>
          {supplier ? (
            <div className="panel">
              <PanelHeader title="Products supplied" subtitle="Items with this supplier as default" />
              {supplier.products.length === 0 ? <div className="panel-subtitle">No products linked.</div> : null}
              {supplier.products.map(product => (
                <div key={product.id} className="totals-row">
                  <Link className="link" href={`/inventory/${product.id}`}>{product.name}</Link>
                  <b>{fmt.number(product.stock_quantity)} {product.unit}</b>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {modal === "edit" && <PartyModal kind={kind} party={data} onClose={() => setModal(null)} onSaved={() => { toast("Details saved"); setModal(null); reload(); }} />}
      {modal === "payment" && (
        <PartyPaymentModal
          partyTypes={[kind]}
          fixed={{ type: kind, id: data.id, name: data.name, balance: data.balance, openInvoices: data.open_invoices }}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }}
        />
      )}
    </>
  );
}

type PartyOption = { id: number; name: string; balance: number };

export function PartyPaymentModal({
  partyTypes,
  fixed,
  onClose,
  onSaved,
}: {
  partyTypes: Kind[];
  fixed?: { type: Kind; id: number; name: string; balance: number; openInvoices: OpenInvoice[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const fmt = useFormat();
  const toast = useToast();
  const [type, setType] = useState<Kind>(fixed?.type ?? partyTypes[0]);
  const [party, setParty] = useState<PartyOption | null>(fixed ? { id: fixed.id, name: fixed.name, balance: fixed.balance } : null);
  const [invoices, setInvoices] = useState<OpenInvoice[]>(fixed?.openInvoices ?? []);

  const choose = async (item: PartyOption | null) => {
    setParty(item);
    setInvoices([]);
    if (!item) return;
    const detail = await loadDetail(type, item.id);
    setParty({ id: detail.id, name: detail.name, balance: detail.balance });
    setInvoices(detail.open_invoices);
  };

  return (
    <FormModal
      eyebrow="Record payment"
      title={fixed ? `Payment · ${fixed.name}` : "Record a payment"}
      description={type === "customer" ? "Money received from a customer reduces their receivable." : "Money paid to a supplier reduces what you owe."}
      submitLabel="Save payment"
      onClose={onClose}
      onSubmit={async form => {
        if (!party) throw new Error(`Select a ${type}`);
        await paymentService.create({
          party_type: type,
          customer_id: type === "customer" ? party.id : null,
          supplier_id: type === "supplier" ? party.id : null,
          invoice_id: form.get("invoice_id") || null,
          amount: Number(form.get("amount")),
          payment_method: form.get("payment_method"),
          payment_date: form.get("payment_date"),
          reference: form.get("reference"),
          notes: form.get("notes"),
        });
        toast(`Payment ${type === "customer" ? "from" : "to"} ${party.name} recorded`);
        onSaved();
      }}
    >
      <div className="form-grid">
        {!fixed && partyTypes.length > 1 ? (
          <Field label="Payment type" full>
            <select className="select-dark" value={type} onChange={e => { setType(e.target.value as Kind); setParty(null); setInvoices([]); }}>
              {partyTypes.includes("customer") ? <option value="customer">Received from customer</option> : null}
              {partyTypes.includes("supplier") ? <option value="supplier">Paid to supplier</option> : null}
            </select>
          </Field>
        ) : null}
        {!fixed ? (
          <Field label={titleCase(type)} full>
            <RemoteSelect<PartyOption>
              key={type}
              load={search => loadList(type, { search, balance: "outstanding", pageSize: 50, sort: "name", order: "asc" })
                .then(r => r.data.map(p => ({ id: p.id, name: p.name, balance: p.balance })))}
              value={party?.id ?? null}
              onChange={(_, item) => void choose(item)}
              getLabel={p => `${p.name} · owes ${fmt.money(p.balance)}`}
              noun={`${type} with a balance`}
              required
            />
          </Field>
        ) : null}
        {party ? <Field label="Outstanding balance" full><input className="input-dark" value={fmt.money(party.balance)} readOnly /></Field> : null}
        <Field label="Apply to invoice" full>
          <select className="select-dark" name="invoice_id" defaultValue="">
            <option value="">Oldest open invoices first</option>
            {invoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.invoice_number} · {formatDate(invoice.date)} · {fmt.money(invoice.remaining)} due</option>)}
          </select>
        </Field>
        <Field label="Amount"><input className="input-dark" name="amount" type="number" min="0.01" step="0.01" max={party?.balance} defaultValue={party?.balance ?? ""} key={party?.id ?? "none"} required /></Field>
        <Field label="Method">
          <select className="select-dark" name="payment_method" defaultValue="cash">
            {PAYMENT_METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </Field>
        <Field label="Date"><input className="input-dark" name="payment_date" type="date" defaultValue={todayIso()} required /></Field>
        <Field label="Reference"><input className="input-dark" name="reference" maxLength={120} placeholder="Cheque / transaction #" /></Field>
        <Field label="Notes" full><textarea className="textarea-dark" name="notes" maxLength={500} /></Field>
      </div>
    </FormModal>
  );
}
