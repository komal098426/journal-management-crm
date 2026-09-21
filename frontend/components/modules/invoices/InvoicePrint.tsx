"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { ErrorState, LoadingState, StatusBadge } from "@/components/ui/primitives";
import { useApi } from "@/hooks/useApi";
import { formatDate, titleCase, useFormat } from "@/lib/format";
import { saleService } from "@/services/erp";

export function InvoicePrint({ id }: { id: number }) {
  const fmt = useFormat();
  const { data, error, loading, reload } = useApi(() => saleService.invoice(id), [id]);

  if (loading && !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><LoadingState /></div>;
  if (error || !data) return <div className="panel page-panel" style={{ marginTop: 27 }}><ErrorState message={error ?? "Not found"} onRetry={reload} /></div>;
  const { sale, settings } = data;

  return (
    <>
      <div className="page-heading no-print">
        <div>
          <div className="eyebrow">Invoice</div>
          <h1>{sale.invoice_number}</h1>
        </div>
        <div className="heading-actions">
          <Link className="secondary-button" href={`/sales/${id}`}><ArrowLeft size={13} /> Back</Link>
          <button className="primary-button" onClick={() => window.print()}><Printer size={14} /> Print</button>
        </div>
      </div>
      <article className="invoice-sheet">
        <div className="invoice-head">
          <div>
            <div className="eyebrow">Tax invoice</div>
            <h2>{settings.company_name}</h2>
            <div className="panel-subtitle">{settings.timezone}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <h2>{sale.invoice_number}</h2>
            <div className="panel-subtitle">Date · {formatDate(sale.sale_date)}</div>
            <div style={{ marginTop: 8 }}><StatusBadge status={sale.status} /></div>
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div className="eyebrow">Bill to</div>
          <div className="panel-title" style={{ marginTop: 6 }}>{sale.customer_name}</div>
        </div>
        <table>
          <thead>
            <tr><th>#</th><th>Item</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Discount</th><th className="num">Amount</th></tr>
          </thead>
          <tbody>
            {sale.items.map((item, index) => (
              <tr key={item.id}>
                <td className="mono">{index + 1}</td>
                <td><b>{item.product.name}</b><div className="mono">{item.product.sku}</div></td>
                <td className="num">{fmt.number(item.quantity)} {item.product.unit}</td>
                <td className="num">{fmt.money(item.selling_price)}</td>
                <td className="num">{fmt.money(item.discount)}</td>
                <td className="num">{fmt.money(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="totals-panel">
          <div className="panel-subtitle">
            Payment method · {titleCase(sale.payment_method)}
            {sale.notes ? <div style={{ marginTop: 6 }}>{sale.notes}</div> : null}
          </div>
          <div className="totals-box" style={{ background: "#f7f8fa" }}>
            <div className="totals-row"><span>Subtotal</span><b>{fmt.money(sale.subtotal)}</b></div>
            <div className="totals-row"><span>Discount</span><b>− {fmt.money(sale.discount)}</b></div>
            <div className="totals-row"><span>Tax</span><b>{fmt.money(sale.tax)}</b></div>
            <div className="totals-row grand"><span>Total</span><b>{fmt.money(sale.total)}</b></div>
            {sale.returned_amount > 0 ? <div className="totals-row"><span>Returned</span><b>− {fmt.money(sale.returned_amount)}</b></div> : null}
            <div className="totals-row"><span>Paid</span><b>{fmt.money(sale.paid_amount)}</b></div>
            <div className="totals-row grand"><span>Balance due</span><b>{sale.status === "cancelled" ? "Cancelled" : fmt.money(sale.remaining_amount)}</b></div>
          </div>
        </div>
        <p className="panel-subtitle" style={{ marginTop: 28, textAlign: "center" }}>{settings.invoice_footer}</p>
      </article>
    </>
  );
}
