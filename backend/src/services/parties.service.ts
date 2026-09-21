import type { z } from "zod";
import { supabase } from "../config/supabase.js";
import { unwrap } from "../utils/db.js";
import { num } from "../utils/money.js";
import type { ListQuery } from "../utils/query.js";
import type { partySchema } from "../validators/erp.js";
import { crud, type Row } from "./resource.js";

type PartyInput = z.infer<typeof partySchema>;
export type BalanceFilter = "outstanding" | "clear" | "credit";

type Transaction = {
  id: string;
  date: string;
  created_at: string;
  type: "sale" | "purchase" | "payment" | "refund" | "return" | "cancellation";
  reference: string;
  description: string;
  amount: number;
  status?: string;
  link?: { kind: "sale" | "purchase"; id: number };
};

const byNewest = (a: Transaction, b: Transaction) =>
  b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at);

function applyBalanceFilter(q: Row, balance?: BalanceFilter) {
  if (balance === "outstanding") return q.gt("balance", 0);
  if (balance === "clear") return q.eq("balance", 0);
  if (balance === "credit") return q.lt("balance", 0);
  return q;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
const customers = crud({
  table: "customers",
  label: "Customer",
  sortable: ["name", "total_sales", "total_paid", "balance", "created_at"],
  defaultSort: "name",
  searchColumns: ["name", "phone", "email"],
  inUseMessage: "This customer has sales or payments and cannot be deleted",
});

export const listCustomers = (query: ListQuery, balance?: BalanceFilter) => customers.list(query, q => applyBalanceFilter(q, balance));
export const createCustomer = (input: PartyInput) => customers.create(input);
export const updateCustomer = (id: number, input: PartyInput) => customers.update(id, input);
export const deleteCustomer = customers.remove;

export async function getCustomer(id: number) {
  const customer = await customers.get(id);
  const [sales, payments, returns] = await Promise.all([
    supabase.from("v_sales").select("*").eq("customer_id", id).order("sale_date", { ascending: false }).limit(200),
    supabase.from("v_payments").select("*").eq("customer_id", id).order("payment_date", { ascending: false }).limit(200),
    supabase.from("v_sales_returns").select("*").eq("customer_id", id).order("return_date", { ascending: false }).limit(200),
  ]);
  const saleRows = unwrap(sales) as Row[];
  const paymentRows = unwrap(payments) as Row[];
  const returnRows = unwrap(returns) as Row[];

  const transactions: Transaction[] = [
    ...saleRows.map(sale => ({
      id: `sale-${sale.id}`, date: sale.sale_date, created_at: sale.created_at, type: "sale" as const,
      reference: sale.invoice_number, description: `${sale.items_count} item(s)`, amount: num(sale.total),
      status: sale.status, link: { kind: "sale" as const, id: sale.id },
    })),
    ...paymentRows.map(payment => ({
      id: `payment-${payment.id}`, date: payment.payment_date, created_at: payment.created_at,
      type: payment.direction === "in" ? ("payment" as const) : ("refund" as const),
      reference: payment.reference ?? `PAY-${payment.id}`, description: payment.notes ?? payment.payment_method,
      amount: num(payment.amount),
    })),
    ...returnRows.map(ret => ({
      id: `return-${ret.id}`, date: ret.return_date, created_at: ret.created_at, type: "return" as const,
      reference: ret.return_number, description: `Against ${ret.invoice_number}`, amount: num(ret.total_amount),
      link: { kind: "sale" as const, id: ret.sale_id },
    })),
  ].sort(byNewest);

  const openInvoices = saleRows
    .filter(sale => sale.status !== "cancelled" && num(sale.remaining_amount) > 0)
    .map(sale => ({ id: sale.id, invoice_number: sale.invoice_number, date: sale.sale_date, total: num(sale.total), remaining: num(sale.remaining_amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...customer,
    summary: {
      invoices: saleRows.filter(sale => sale.status !== "cancelled").length,
      returns: returnRows.reduce((sum, ret) => sum + num(ret.total_amount), 0),
      last_sale_date: saleRows[0]?.sale_date ?? null,
    },
    open_invoices: openInvoices,
    transactions,
  };
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------
const suppliers = crud({
  table: "suppliers",
  label: "Supplier",
  sortable: ["name", "total_purchases", "total_paid", "balance", "created_at"],
  defaultSort: "name",
  searchColumns: ["name", "phone", "email"],
  inUseMessage: "This supplier has purchases or payments and cannot be deleted",
});

export const listSuppliers = (query: ListQuery, balance?: BalanceFilter) => suppliers.list(query, q => applyBalanceFilter(q, balance));
export const createSupplier = (input: PartyInput) => suppliers.create(input);
export const updateSupplier = (id: number, input: PartyInput) => suppliers.update(id, input);
export const deleteSupplier = suppliers.remove;

export async function getSupplier(id: number) {
  const supplier = await suppliers.get(id);
  const [purchases, payments, returns, products] = await Promise.all([
    supabase.from("v_purchases").select("*").eq("supplier_id", id).order("purchase_date", { ascending: false }).limit(200),
    supabase.from("v_payments").select("*").eq("supplier_id", id).order("payment_date", { ascending: false }).limit(200),
    supabase.from("v_purchase_returns").select("*").eq("supplier_id", id).order("return_date", { ascending: false }).limit(200),
    supabase.from("products").select("id, name, sku, stock_quantity, unit").eq("supplier_id", id).order("name").limit(50),
  ]);
  const purchaseRows = unwrap(purchases) as Row[];
  const paymentRows = unwrap(payments) as Row[];
  const returnRows = unwrap(returns) as Row[];

  const transactions: Transaction[] = [
    ...purchaseRows.map(purchase => ({
      id: `purchase-${purchase.id}`, date: purchase.purchase_date, created_at: purchase.created_at, type: "purchase" as const,
      reference: purchase.invoice_number, description: `${purchase.items_count} item(s)`, amount: num(purchase.total),
      status: purchase.status, link: { kind: "purchase" as const, id: purchase.id },
    })),
    ...paymentRows.map(payment => ({
      id: `payment-${payment.id}`, date: payment.payment_date, created_at: payment.created_at,
      type: payment.direction === "out" ? ("payment" as const) : ("refund" as const),
      reference: payment.reference ?? `PAY-${payment.id}`, description: payment.notes ?? payment.payment_method,
      amount: num(payment.amount),
    })),
    ...returnRows.map(ret => ({
      id: `return-${ret.id}`, date: ret.return_date, created_at: ret.created_at, type: "return" as const,
      reference: ret.return_number, description: `Against ${ret.invoice_number}`, amount: num(ret.total_amount),
      link: { kind: "purchase" as const, id: ret.purchase_id },
    })),
  ].sort(byNewest);

  const openInvoices = purchaseRows
    .filter(purchase => purchase.status !== "cancelled" && num(purchase.remaining_amount) > 0)
    .map(purchase => ({ id: purchase.id, invoice_number: purchase.invoice_number, date: purchase.purchase_date, total: num(purchase.total), remaining: num(purchase.remaining_amount) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...supplier,
    summary: {
      invoices: purchaseRows.filter(purchase => purchase.status !== "cancelled").length,
      returns: returnRows.reduce((sum, ret) => sum + num(ret.total_amount), 0),
      last_purchase_date: purchaseRows[0]?.purchase_date ?? null,
    },
    open_invoices: openInvoices,
    products: unwrap(products),
    transactions,
  };
}
