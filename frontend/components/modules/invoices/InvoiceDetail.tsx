"use client";

import { Ban, FileText, Pencil, Undo2, Wallet } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { FormModal } from "@/components/ui/Modal";
import { ErrorState, Field, LoadingState, PanelHeader, StatusBadge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/Toast";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, PAYMENT_METHODS, titleCase, todayIso, useFormat } from "@/lib/format";
import { paymentService, purchaseReturnService, purchaseService, saleService, salesReturnService } from "@/services/erp";
import type { AllocatedPayment, PurchaseDetail, PurchaseItem, SaleDetail, SaleItem } from "@/types/erp";
import { InvoiceForm } from "./InvoiceForm";

type Kind = "sale" | "purchase";
type Detail = SaleDetail | PurchaseDetail;
type Item = SaleItem | PurchaseItem;

export function InvoiceDetail({ kind, id }: { kind: Kind; id: number }) {
  const isSale = kind === "sale";
  const { can } = useAuth();
  const fmt = useFormat();
  const toast = useToast();
  const [modal, setModal] = useState<"return" | "payment" | "cancel" | null>(null);
  const { data, error, loading, reload } = useApi<Detail>(() => (isSale ? saleService.get(id) : purchaseService.get(id)), [id, isSale]);

  useEffect(() => {
    if (data && new URLSearchParams(window.location.search).get("return") === "1") setModal("return");
  }, [data]);

  if (loading && !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><LoadingState /></div>;
  if (error || !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;

  const sale = isSale ? (data as SaleDetail) : null;
  const purchase = !isSale ? (data as PurchaseDetail) : null;
  const partyName = sale ? sale.customer_name : purchase!.supplier_name;
  const partyHref = sale ? (sale.customer_id ? `/customers/${sale.customer_id}` : null) : `/suppliers/${purchase!.supplier_id}`;
  const cancelled = data.status === "cancelled";
  const returnable = data.items.some(item => item.quantity > item.returned_quantity);
  const write = can(isSale ? "sales:write" : "purchases:write");
  const canCancel = can(isSale ? "sales:cancel" : "purchases:cancel");
  const hasParty = isSale ? !!sale!.customer_id : true;
  const base = isSale ? "sales" : "purchases";

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{isSale ? "Sale" : "Purchase"} · {formatDate(sale?.sale_date ?? purchase?.purchase_date)}</div>
          <h1>{data.invoice_number}</h1>
          <p>
            {partyHref ? <Link className="link" href={partyHref}>{partyName}</Link> : partyName} · {data.items.length} line(s) · {titleCase(data.payment_method)}{" "}
            <StatusBadge status={data.status} />
          </p>
        </div>
        <div className="heading-actions" style={{ flexWrap: "wrap" }}>
          {isSale ? <Link className="secondary-button" href={`/sales/${id}/invoice`}><FileText size={13} /> Invoice</Link> : null}
          {write && !cancelled && data.returned_amount === 0 ? <Link className="secondary-button" href={`/${base}/${id}/edit`}><Pencil size={13} /> Edit</Link> : null}
          {write && !cancelled && returnable ? <button className="secondary-button" onClick={() => setModal("return")}><Undo2 size={13} /> Return items</button> : null}
          {canCancel && !cancelled ? <button className="secondary-button" onClick={() => setModal("cancel")}><Ban size={13} /> Cancel</button> : null}
          {write && !cancelled && hasParty && data.remaining_amount > 0 ? (
            <button className="primary-button" onClick={() => setModal("payment")}><Wallet size={14} /> Record payment</button>
          ) : null}
        </div>
      </div>

      <div className="panel data-panel page-panel">
        <div className="detail-grid" style={{ paddingTop: 20 }}>
          <div className="mini-metric"><span>Total</span><b>{fmt.money(data.total)}</b></div>
          <div className="mini-metric"><span>Paid</span><b>{fmt.money(data.paid_amount)}</b></div>
          <div className="mini-metric"><span>Returned</span><b>{fmt.money(data.returned_amount)}</b></div>
          <div className="mini-metric"><span>{isSale ? "Balance due" : "Payable"}</span><b className={!cancelled && data.remaining_amount > 0 ? "danger-text" : undefined}>{cancelled ? "Cancelled" : fmt.money(data.remaining_amount)}</b></div>
        </div>
        <DataTable<Item>
          columns={[
            { key: "product", label: "Product", render: item => <div className="person-cell"><div><b>{item.product.name}</b><span>{item.product.sku}</span></div></div> },
            { key: "quantity", label: "Qty", numeric: true, render: item => `${fmt.number(item.quantity)} ${item.product.unit}` },
            { key: "returned_quantity", label: "Returned", numeric: true, render: item => (item.returned_quantity ? fmt.number(item.returned_quantity) : "—") },
            { key: "price", label: isSale ? "Price" : "Cost", numeric: true, render: item => fmt.money("selling_price" in item ? item.selling_price : item.purchase_price) },
            { key: "discount", label: "Discount", numeric: true, render: item => fmt.money(item.discount) },
            { key: "subtotal", label: "Subtotal", numeric: true, render: item => fmt.money(item.subtotal) },
          ]}
          rows={data.items}
        />
        <div className="totals-panel" style={{ padding: "0 20px 20px" }}>
          <div className="panel-subtitle">{data.notes ? `Notes: ${data.notes}` : null}</div>
          <div className="totals-box">
            <div className="totals-row"><span>Subtotal</span><b>{fmt.money(data.subtotal)}</b></div>
            <div className="totals-row"><span>Discount</span><b>− {fmt.money(data.discount)}</b></div>
            <div className="totals-row"><span>Tax</span><b>{fmt.money(data.tax)}</b></div>
            <div className="totals-row grand"><span>Total</span><b>{fmt.money(data.total)}</b></div>
          </div>
        </div>
      </div>

      <div className="content-grid" style={{ marginTop: 10 }}>
        <div className="panel data-panel">
          <div style={{ padding: "20px 20px 0" }}><PanelHeader title="Payments" subtitle="Money received or paid against this invoice, including refunds" /></div>
          <DataTable<AllocatedPayment>
            columns={[
              { key: "payment_date", label: "Date", render: payment => <span className="mono">{formatDate(payment.payment_date)}</span> },
              { key: "direction", label: "Type", render: payment => <StatusBadge status={payment.allocated < 0 ? "refund" : "paid"} label={payment.allocated < 0 ? "Refund" : "Payment"} /> },
              { key: "payment_method", label: "Method", render: payment => titleCase(payment.payment_method) },
              { key: "reference", label: "Reference", render: payment => payment.reference ?? "—" },
              { key: "allocated", label: "Amount", numeric: true, render: payment => fmt.money(payment.allocated) },
            ]}
            rows={data.payments.map((payment, index) => ({ ...payment, id: `${payment.id}-${index}` as unknown as number }))}
            emptyMessage="No payments yet."
          />
        </div>
        <div className="panel data-panel">
          <div style={{ padding: "20px 20px 0" }}><PanelHeader title="Returns" subtitle={isSale ? "Stock back in, receivable reduced" : "Stock sent back, payable reduced"} /></div>
          <DataTable
            columns={[
              { key: "return_number", label: "Return", render: (ret: Detail["returns"][number]) => <div className="person-cell"><div><b>{ret.return_number}</b><span>{formatDate(ret.return_date)}</span></div></div> },
              { key: "total_amount", label: "Amount", numeric: true, render: ret => fmt.money(ret.total_amount) },
              { key: "refund_amount", label: "Refunded", numeric: true, render: ret => fmt.money(ret.refund_amount) },
            ]}
            rows={data.returns}
            emptyMessage="No returns."
          />
        </div>
      </div>

      {modal === "payment" && (
        <FormModal
          eyebrow="Record payment"
          title={`Payment for ${data.invoice_number}`}
          description={`${fmt.money(data.remaining_amount)} is outstanding. The amount is applied to this invoice first.`}
          submitLabel="Save payment"
          onClose={() => setModal(null)}
          onSubmit={async form => {
            await paymentService.create({
              party_type: isSale ? "customer" : "supplier",
              customer_id: sale?.customer_id ?? null,
              supplier_id: purchase?.supplier_id ?? null,
              invoice_id: data.id,
              amount: Number(form.get("amount")),
              payment_method: form.get("payment_method"),
              payment_date: form.get("payment_date"),
              reference: form.get("reference"),
              notes: form.get("notes"),
            });
            toast("Payment recorded");
            setModal(null);
            reload();
          }}
        >
          <div className="form-grid">
            <Field label="Amount"><input className="input-dark" name="amount" type="number" min="0.01" step="0.01" max={data.remaining_amount} defaultValue={data.remaining_amount} required /></Field>
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
      )}

      {modal === "return" && (
        <FormModal
          wide
          eyebrow={isSale ? "Sales return" : "Purchase return"}
          title={`Return items from ${data.invoice_number}`}
          description={isSale
            ? "Returned stock goes back into inventory. The value is credited against the open balance first; anything beyond it is refunded."
            : "Returned stock leaves inventory. The value reduces what you owe first; anything beyond it is refunded by the supplier."}
          submitLabel="Record return"
          onClose={() => setModal(null)}
          onSubmit={async form => {
            const items = data.items
              .map(item => ({ id: item.id, quantity: Number(form.get(`qty-${item.id}`) || 0) }))
              .filter(item => item.quantity > 0);
            if (items.length === 0) throw new Error("Enter a quantity for at least one item");
            const common = { return_date: form.get("return_date"), reason: form.get("reason"), refund_method: form.get("refund_method") };
            if (isSale) {
              const ret = await salesReturnService.create({ ...common, sale_id: data.id, items: items.map(item => ({ sale_item_id: item.id, quantity: item.quantity })) });
              toast(`${ret.return_number} recorded · ${fmt.money(ret.total_amount)}`);
            } else {
              const ret = await purchaseReturnService.create({ ...common, purchase_id: data.id, items: items.map(item => ({ purchase_item_id: item.id, quantity: item.quantity })) });
              toast(`${ret.return_number} recorded · ${fmt.money(ret.total_amount)}`);
            }
            setModal(null);
            reload();
          }}
        >
          <div className="table-wrap">
            <table className="line-items" style={{ minWidth: 0 }}>
              <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Returned</th><th className="num">Return now</th></tr></thead>
              <tbody>
                {data.items.map(item => {
                  const open = item.quantity - item.returned_quantity;
                  return (
                    <tr key={item.id}>
                      <td style={{ color: "#f3efe6" }}>{item.product.name}</td>
                      <td className="num" style={{ color: "#d8d5ce" }}>{fmt.number(item.quantity)}</td>
                      <td className="num" style={{ color: "#d8d5ce" }}>{fmt.number(item.returned_quantity)}</td>
                      <td style={{ width: 120 }}>
                        <input className="input-dark num" name={`qty-${item.id}`} type="number" min="0" max={open} step="any" defaultValue={0} disabled={open <= 0} aria-label={`Return quantity for ${item.product.name}`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <Field label="Return date"><input className="input-dark" name="return_date" type="date" defaultValue={todayIso()} required /></Field>
            <Field label="Refund method (if any)">
              <select className="select-dark" name="refund_method" defaultValue={data.payment_method}>
                {PAYMENT_METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Reason" full><input className="input-dark" name="reason" maxLength={500} placeholder="Damaged, wrong item…" /></Field>
          </div>
        </FormModal>
      )}

      {modal === "cancel" && (
        <FormModal
          danger
          eyebrow="Cancel invoice"
          title={`Cancel ${data.invoice_number}?`}
          description={isSale
            ? `Unreturned items go back into stock${data.paid_amount > 0 ? ` and ${fmt.money(data.paid_amount)} is refunded to the customer` : ""}. This cannot be undone.`
            : `Unreturned items are removed from stock${data.paid_amount > 0 ? ` and ${fmt.money(data.paid_amount)} is recorded as refunded by the supplier` : ""}. This cannot be undone.`}
          submitLabel="Cancel invoice"
          onClose={() => setModal(null)}
          onSubmit={async form => {
            await (isSale ? saleService : purchaseService).cancel(data.id, data.paid_amount > 0 ? { refund_method: form.get("refund_method") } : {});
            toast(`${data.invoice_number} cancelled`);
            setModal(null);
            reload();
          }}
        >
          {data.paid_amount > 0 ? (
            <Field label="Refund method">
              <select className="select-dark" name="refund_method" defaultValue={data.payment_method}>
                {PAYMENT_METHODS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
          ) : null}
        </FormModal>
      )}
    </>
  );
}

/** Loads an invoice and opens it in the edit form when it can still be edited. */
export function InvoiceEditLoader({ kind, id }: { kind: Kind; id: number }) {
  const { data, error, loading, reload } = useApi<Detail>(() => (kind === "sale" ? saleService.get(id) : purchaseService.get(id)), [id, kind]);
  if (loading && !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><LoadingState /></div>;
  if (error || !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;
  if (data.status === "cancelled" || data.returned_amount > 0) {
    return (
      <div className="panel page-panel" style={{ marginTop: 27 }}>
        <ErrorState message={data.status === "cancelled" ? "Cancelled invoices cannot be edited." : "This invoice has returns and can no longer be edited."} />
        <div style={{ padding: "0 20px 20px" }}><Link className="secondary-button" href={`/${kind === "sale" ? "sales" : "purchases"}/${id}`}>Back to invoice</Link></div>
      </div>
    );
  }
  return <InvoiceForm kind={kind} existing={data} />;
}
