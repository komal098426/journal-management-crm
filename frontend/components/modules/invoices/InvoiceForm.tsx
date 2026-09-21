"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { RemoteSelect } from "@/components/ui/RemoteSelect";
import { Field, PanelHeader } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { PAYMENT_METHODS, todayIso, useFormat } from "@/lib/format";
import { customerService, productService, purchaseService, saleService, supplierService } from "@/services/erp";
import type { Customer, Product, PurchaseDetail, SaleDetail, Supplier } from "@/types/erp";

type Kind = "sale" | "purchase";
type LineProduct = Pick<Product, "id" | "name" | "sku" | "unit" | "stock_quantity"> & { selling_price?: number; purchase_price?: number };
type Line = { key: string; product_id: number | null; product: LineProduct | null; quantity: string; price: string; discount: string };
type PartyOption = { id: number; name: string; balance?: number };

const cents = (value: string | number) => Math.round((Number(value) || 0) * 100);
let lineCounter = 0;
const newLine = (): Line => ({ key: `new-${++lineCounter}`, product_id: null, product: null, quantity: "1", price: "0", discount: "0" });

export function InvoiceForm({ kind, existing }: { kind: Kind; existing?: SaleDetail | PurchaseDetail }) {
  const isSale = kind === "sale";
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const sale = isSale ? (existing as SaleDetail | undefined) : undefined;
  const purchase = !isSale ? (existing as PurchaseDetail | undefined) : undefined;

  const [partyId, setPartyId] = useState<number | null>(sale?.customer_id ?? purchase?.supplier_id ?? null);
  const [partyOption, setPartyOption] = useState<PartyOption | null>(
    sale?.customer_id ? { id: sale.customer_id, name: sale.customer_name } : purchase ? { id: purchase.supplier_id, name: purchase.supplier_name } : null,
  );
  const [date, setDate] = useState(sale?.sale_date ?? purchase?.purchase_date ?? todayIso());
  const [invoiceNumber, setInvoiceNumber] = useState(purchase?.invoice_number ?? "");
  const [method, setMethod] = useState<string>(existing?.payment_method ?? "cash");
  const [discount, setDiscount] = useState(existing ? String(existing.discount) : "0");
  const [taxMode, setTaxMode] = useState<"rate" | "amount">(existing ? "amount" : "rate");
  const [taxValue, setTaxValue] = useState(existing ? String(existing.tax) : "0");
  const [paid, setPaid] = useState("0");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>(() => {
    if (sale) {
      return sale.items.map(item => ({
        key: `item-${item.id}`, product_id: item.product_id, product: item.product,
        quantity: String(item.quantity), price: String(item.selling_price), discount: String(item.discount),
      }));
    }
    if (purchase) {
      return purchase.items.map(item => ({
        key: `item-${item.id}`, product_id: item.product_id, product: item.product,
        quantity: String(item.quantity), price: String(item.purchase_price), discount: String(item.discount),
      }));
    }
    return [newLine()];
  });

  // "New sale" from a customer page preselects that customer.
  useEffect(() => {
    if (existing) return;
    const param = new URLSearchParams(window.location.search).get(isSale ? "customer" : "supplier");
    const id = Number(param);
    if (!param || !Number.isInteger(id) || id <= 0) return;
    (isSale ? customerService.get(id) : supplierService.get(id))
      .then(party => { setPartyOption({ id: party.id, name: party.name, balance: party.balance }); setPartyId(party.id); })
      .catch(() => {});
  }, [existing, isSale]);

  // Quantity already on this invoice is available again when editing a sale.
  const originalQty = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of existing?.items ?? []) map.set(item.product_id, (map.get(item.product_id) ?? 0) + Number(item.quantity));
    return map;
  }, [existing]);

  const totals = useMemo(() => {
    const lineCents = lines.map(line => Math.max(0, cents(Number(line.quantity) * Number(line.price)) - cents(line.discount)));
    const subtotal = lineCents.reduce((sum, value) => sum + value, 0);
    const taxable = Math.max(0, subtotal - cents(discount));
    const tax = taxMode === "rate" ? Math.round((taxable * (Number(taxValue) || 0)) / 100) : cents(taxValue);
    const total = taxable + tax;
    const alreadyPaid = existing ? cents(existing.paid_amount) : 0;
    return { lineCents, subtotal, tax, total, alreadyPaid, due: total - alreadyPaid - cents(paid) };
  }, [lines, discount, taxMode, taxValue, paid, existing]);

  const problems = useMemo(() => {
    const list: string[] = [];
    const chosen = lines.filter(line => line.product_id);
    if (chosen.length === 0) list.push("Add at least one product.");
    if (!isSale && !partyId) list.push("Select a supplier.");
    const required = new Map<number, { qty: number; product: LineProduct }>();
    lines.forEach((line, index) => {
      if (!line.product_id) return;
      const qty = Number(line.quantity);
      if (!(qty > 0)) list.push(`Line ${index + 1}: quantity must be greater than zero.`);
      if (Number(line.price) < 0) list.push(`Line ${index + 1}: price cannot be negative.`);
      if (cents(line.discount) > cents(qty * Number(line.price))) list.push(`Line ${index + 1}: discount exceeds the line amount.`);
      if (line.product) {
        const entry = required.get(line.product_id) ?? { qty: 0, product: line.product };
        entry.qty += qty || 0;
        required.set(line.product_id, entry);
      }
    });
    if (isSale) {
      for (const [productId, { qty, product }] of required) {
        const available = Number(product.stock_quantity) + (originalQty.get(productId) ?? 0);
        if (qty > available) list.push(`Only ${fmt.number(available)} ${product.unit} of ${product.name} in stock (${fmt.number(qty)} requested).`);
      }
    }
    if (cents(discount) > totals.subtotal) list.push("Invoice discount cannot exceed the subtotal.");
    if (totals.alreadyPaid + cents(paid) > totals.total) list.push(existing ? "The new total is lower than the amount already paid." : "Paid amount cannot exceed the total.");
    if (isSale && !partyId && totals.due > 0 && chosen.length) list.push("Walk-in sales must be paid in full — select a customer to sell on credit.");
    return list;
  }, [lines, isSale, partyId, originalQty, discount, totals, paid, existing, fmt]);

  const updateLine = (key: string, patch: Partial<Line>) => setLines(current => current.map(line => (line.key === key ? { ...line, ...patch } : line)));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (problems.length) return;
    setBusy(true);
    setServerError(null);
    const body: Record<string, unknown> = {
      [isSale ? "customer_id" : "supplier_id"]: partyId,
      [isSale ? "sale_date" : "purchase_date"]: date,
      payment_method: method,
      discount: Number(discount) || 0,
      ...(taxMode === "rate" ? { tax_rate: Number(taxValue) || 0 } : { tax: Number(taxValue) || 0 }),
      notes,
      items: lines.filter(line => line.product_id).map(line => ({
        product_id: line.product_id,
        quantity: Number(line.quantity),
        [isSale ? "selling_price" : "purchase_price"]: Number(line.price) || 0,
        discount: Number(line.discount) || 0,
      })),
      ...(isSale ? {} : { invoice_number: invoiceNumber }),
      ...(existing ? { additional_payment: Number(paid) || 0 } : { paid_amount: Number(paid) || 0 }),
    };
    try {
      const service = isSale ? saleService : purchaseService;
      const saved = existing ? await service.update(existing.id, body) : await service.create(body);
      toast(existing ? `${saved.invoice_number} updated` : `${saved.invoice_number} saved`);
      router.push(`/${isSale ? "sales" : "purchases"}/${saved.id}`);
    } catch (error) {
      const details = error instanceof ApiRequestError && error.details?.length ? ` (${error.details.map(detail => detail.message).join("; ")})` : "";
      setServerError(errorMessage(error) + (details && !errorMessage(error).includes(details) ? "" : ""));
      setBusy(false);
    }
  }

  const loadParties = (search: string) =>
    (isSale
      ? customerService.list({ search, pageSize: 50, sort: "name", order: "asc" })
      : supplierService.list({ search, pageSize: 50, sort: "name", order: "asc" })
    ).then(result => (result.data as (Customer | Supplier)[]).map(party => ({ id: party.id, name: party.name, balance: party.balance })));

  const loadProducts = (search: string) =>
    productService.list({ search, pageSize: 50, sort: "name", order: "asc", ...(isSale ? { status: "active" } : {}) }).then(result => result.data);

  return (
    <div className="panel data-panel page-panel" style={{ marginTop: 27 }}>
      <PanelHeader
        title={existing ? `Edit ${existing.invoice_number}` : isSale ? "New sale" : "New purchase"}
        subtitle={isSale
          ? "Stock is deducted and the customer balance updated when you save. Prices and totals are recalculated by the server."
          : "Stock is added, costs updated and the supplier payable recorded when you save."}
      />
      <form className="page-form" onSubmit={submit}>
        <div className="form-grid cols-4">
          <Field label={isSale ? "Customer" : "Supplier"}>
            <RemoteSelect<PartyOption>
              load={loadParties}
              value={partyId}
              onChange={(id, item) => { setPartyId(id); setPartyOption(item); }}
              getLabel={party => `${party.name}${party.balance ? ` · balance ${fmt.money(party.balance)}` : ""}`}
              noun={isSale ? "customer" : "supplier"}
              emptyLabel={isSale ? "Walk-in customer (cash sale)" : "Select supplier"}
              required={!isSale}
              initialOption={partyOption}
            />
          </Field>
          <Field label={isSale ? "Sale date" : "Purchase date"}>
            <input className="input-dark" type="date" value={date} onChange={event => setDate(event.target.value)} required />
          </Field>
          {!isSale ? (
            <Field label="Supplier invoice #" hint="Leave blank to auto-number">
              <input className="input-dark" value={invoiceNumber} onChange={event => setInvoiceNumber(event.target.value)} maxLength={60} placeholder="e.g. SUP-10422" />
            </Field>
          ) : null}
          <Field label="Payment method">
            <select className="select-dark" value={method} onChange={event => setMethod(event.target.value)}>
              {PAYMENT_METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="line-items">
            <thead>
              <tr>
                <th style={{ width: "36%" }}>Product</th>
                <th className="num">{isSale ? "In stock" : "On hand"}</th>
                <th className="num">Quantity</th>
                <th className="num">{isSale ? "Selling price" : "Purchase price"}</th>
                <th className="num">Discount</th>
                <th className="num">Subtotal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key}>
                  <td>
                    <RemoteSelect<LineProduct>
                      compact
                      load={loadProducts}
                      value={line.product_id}
                      initialOption={line.product}
                      noun="product"
                      getLabel={product => `${product.name} · ${product.sku}`}
                      onChange={(id, product) => updateLine(line.key, {
                        product_id: id,
                        product,
                        price: product ? String(isSale ? product.selling_price ?? 0 : product.purchase_price ?? 0) : line.price,
                      })}
                    />
                  </td>
                  <td className="num mono">
                    {line.product ? `${fmt.number(Number(line.product.stock_quantity) + (isSale ? originalQty.get(line.product.id) ?? 0 : 0))} ${line.product.unit}` : "—"}
                  </td>
                  <td><input className="input-dark num" type="number" min="0.001" step="any" value={line.quantity} onChange={event => updateLine(line.key, { quantity: event.target.value })} aria-label={`Line ${index + 1} quantity`} /></td>
                  <td><input className="input-dark num" type="number" min="0" step="0.01" value={line.price} onChange={event => updateLine(line.key, { price: event.target.value })} aria-label={`Line ${index + 1} price`} /></td>
                  <td><input className="input-dark num" type="number" min="0" step="0.01" value={line.discount} onChange={event => updateLine(line.key, { discount: event.target.value })} aria-label={`Line ${index + 1} discount`} /></td>
                  <td className="num">{fmt.money(totals.lineCents[index] / 100)}</td>
                  <td>
                    <button type="button" className="icon-button" style={{ width: 30, height: 30 }} onClick={() => setLines(current => current.length > 1 ? current.filter(item => item.key !== line.key) : [newLine()])} aria-label={`Remove line ${index + 1}`}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="secondary-button" style={{ marginTop: 10 }} onClick={() => setLines(current => [...current, newLine()])}>
          <Plus size={13} /> Add line
        </button>

        <div className="totals-panel">
          <div className="stack">
            <Field label="Notes">
              <textarea className="textarea-dark" value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} placeholder="Delivery terms, references…" />
            </Field>
            {problems.length > 0 && lines.some(line => line.product_id) ? (
              <div className="error-state" style={{ margin: 0 }} role="alert">
                {problems.map(problem => <div key={problem}>{problem}</div>)}
              </div>
            ) : null}
            {serverError ? <div className="error-state" style={{ margin: 0 }} role="alert">{serverError}</div> : null}
          </div>
          <div className="totals-box">
            <div className="totals-row"><span>Subtotal</span><b>{fmt.money(totals.subtotal / 100)}</b></div>
            <div className="totals-row" style={{ alignItems: "center" }}>
              <span>Discount</span>
              <input className="input-dark num" style={{ width: 120 }} type="number" min="0" step="0.01" value={discount} onChange={event => setDiscount(event.target.value)} aria-label="Invoice discount" />
            </div>
            <div className="totals-row" style={{ alignItems: "center" }}>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                Tax
                <select className="select-dark" style={{ padding: "4px 6px" }} value={taxMode} onChange={event => setTaxMode(event.target.value as "rate" | "amount")} aria-label="Tax mode">
                  <option value="rate">%</option>
                  <option value="amount">amount</option>
                </select>
              </span>
              <input className="input-dark num" style={{ width: 120 }} type="number" min="0" step="0.01" value={taxValue} onChange={event => setTaxValue(event.target.value)} aria-label="Tax" />
            </div>
            {taxMode === "rate" ? <div className="totals-row"><span>Tax amount</span><b>{fmt.money(totals.tax / 100)}</b></div> : null}
            <div className="totals-row grand"><span>Total</span><b>{fmt.money(totals.total / 100)}</b></div>
            {existing ? <div className="totals-row"><span>Already paid</span><b>{fmt.money(totals.alreadyPaid / 100)}</b></div> : null}
            <div className="totals-row" style={{ alignItems: "center" }}>
              <span>{existing ? "Additional payment" : "Paid amount"}</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className="secondary-button" style={{ padding: "4px 8px" }} onClick={() => setPaid(String(Math.max(0, totals.total - totals.alreadyPaid) / 100))}>Full</button>
                <input className="input-dark num" style={{ width: 120 }} type="number" min="0" step="0.01" value={paid} onChange={event => setPaid(event.target.value)} aria-label="Paid amount" />
              </span>
            </div>
            <div className="totals-row grand">
              <span>{isSale ? "Balance due" : "Payable"}</span>
              <b className={totals.due > 0 ? "danger-text" : "positive-text"}>{fmt.money(Math.max(0, totals.due) / 100)}</b>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <Link className="secondary-button" href={existing ? `/${isSale ? "sales" : "purchases"}/${existing.id}` : `/${isSale ? "sales" : "purchases"}`}>Cancel</Link>
          <button className="primary-button" type="submit" disabled={busy || problems.length > 0}>
            <Check size={14} /> {busy ? "Saving…" : existing ? "Save changes" : isSale ? "Complete sale" : "Record purchase"}
          </button>
        </div>
      </form>
    </div>
  );
}
