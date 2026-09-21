import type { z } from "zod";
import { supabase } from "../config/supabase.js";
import type { AuthUser } from "../middleware/auth.js";
import { today } from "../utils/dates.js";
import { rpc, unwrap } from "../utils/db.js";
import { ApiError, badRequest, conflict } from "../utils/errors.js";
import { num, round3, toCents } from "../utils/money.js";
import type { ListQuery } from "../utils/query.js";
import type { cancelSchema, saleCreateSchema, saleUpdateSchema } from "../validators/erp.js";
import { priceInvoice, type PricedInvoice } from "./calculations.js";
import { getRow, listRows, type Row } from "./resource.js";
import { getSettings } from "./users.service.js";

type SaleCreate = z.infer<typeof saleCreateSchema>;
type SaleUpdate = z.infer<typeof saleUpdateSchema>;
type LineQty = { product_id: number; quantity: number };

const SORTS = ["sale_date", "invoice_number", "customer_name", "total", "paid_amount", "remaining_amount", "status", "created_at"] as const;

export function listSales(query: ListQuery, filters: { status?: string; customer_id?: number | null }) {
  return listRows({
    source: "v_sales",
    query,
    sortable: SORTS,
    defaultSort: "sale_date",
    searchColumns: ["invoice_number", "customer_name"],
    dateColumn: "sale_date",
    apply: q => {
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.customer_id) q = q.eq("customer_id", filters.customer_id);
      return q;
    },
  });
}

export async function getSale(id: number): Promise<Awaited<ReturnType<typeof getRow>>> {
  const sale = await getRow("v_sales", id, "Sale");
  const [items, returns, allocations] = await Promise.all([
    supabase.from("sale_items").select("*, product:products(id, name, sku, unit, stock_quantity, status)").eq("sale_id", id).order("id"),
    supabase.from("v_sales_returns").select("*").eq("sale_id", id).order("created_at"),
    supabase.from("payment_allocations")
      .select("amount, payment:payments(id, direction, amount, payment_method, reference, notes, payment_date, created_at)")
      .eq("sale_id", id).order("id"),
  ]);
  return {
    ...sale,
    items: unwrap(items),
    returns: unwrap(returns),
    payments: (unwrap(allocations) as Row[]).map(allocation => ({ ...allocation.payment, allocated: num(allocation.amount) })),
  };
}

export async function getInvoice(id: number) {
  const [sale, settings] = await Promise.all([getSale(id), getSettings()]);
  return { sale, settings };
}

function totalsByProduct(lines: LineQty[]) {
  const totals = new Map<number, number>();
  for (const line of lines) totals.set(line.product_id, round3((totals.get(line.product_id) ?? 0) + Number(line.quantity)));
  return totals;
}

/**
 * Validates products, stock and pricing for a new or edited sale.
 * `previous` holds the lines of the sale being edited: their stock is
 * available again because the edit reverses them first.
 */
async function prepareSale(input: SaleCreate | SaleUpdate, paid: number, previous: LineQty[] = []) {
  const productIds = [...new Set(input.items.map(item => item.product_id))];
  const products = new Map<number, Row>(
    (unwrap(await supabase.from("products").select("id, name, unit, status, stock_quantity").in("id", productIds)) as Row[])
      .map(product => [Number(product.id), product]),
  );
  const previousTotals = totalsByProduct(previous);

  for (const [productId, required] of totalsByProduct(input.items)) {
    const product = products.get(productId);
    if (!product) throw badRequest(`Product #${productId} was not found`);
    if (product.status !== "active" && !previousTotals.has(productId)) {
      throw badRequest(`${product.name} is inactive and cannot be sold`);
    }
    const available = round3(num(product.stock_quantity) + (previousTotals.get(productId) ?? 0));
    if (required > available) {
      throw new ApiError(409, `Insufficient stock for ${product.name}: ${available} ${product.unit} available, ${required} requested`, "INSUFFICIENT_STOCK");
    }
  }

  if (input.customer_id) {
    const customer = await supabase.from("customers").select("id").eq("id", input.customer_id).maybeSingle();
    if (customer.error) throw badRequest("Could not verify the customer");
    if (!customer.data) throw badRequest("The selected customer does not exist");
  }

  const priced = priceInvoice(
    {
      lines: input.items.map(item => ({ quantity: item.quantity, price: item.selling_price, discount: item.discount })),
      discount: input.discount,
      tax: input.tax,
      taxRate: input.tax_rate,
      paid,
    },
    { enforcePaid: false },
  );
  return priced;
}

function salePayload(input: SaleCreate | SaleUpdate, priced: PricedInvoice) {
  return {
    customer_id: input.customer_id ?? null,
    sale_date: input.sale_date,
    payment_method: input.payment_method,
    notes: input.notes,
    subtotal: priced.subtotal,
    discount: priced.discount,
    tax: priced.tax,
    total: priced.total,
    items: priced.lines.map((line, index) => ({
      product_id: input.items[index].product_id,
      quantity: line.quantity,
      selling_price: line.price,
      discount: line.discount,
      subtotal: line.subtotal,
    })),
  };
}

export async function createSale(input: SaleCreate, user: AuthUser) {
  const priced = await prepareSale(input, input.paid_amount);
  if (toCents(priced.paid) > toCents(priced.total)) throw badRequest("Paid amount cannot be more than the invoice total");
  if (!input.customer_id && toCents(priced.paid) < toCents(priced.total)) {
    throw badRequest("Walk-in sales must be paid in full. Select a customer to sell on credit.");
  }
  const id = await rpc<number>("erp_create_sale", { p: { ...salePayload(input, priced), paid_amount: priced.paid }, p_user: user.id });
  return getSale(Number(id));
}

export async function updateSale(id: number, input: SaleUpdate, user: AuthUser) {
  const existing = await getRow("sales", id, "Sale");
  if (existing.status === "cancelled") throw conflict("Cancelled sales cannot be edited");
  if (num(existing.returned_amount) > 0) throw conflict("This sale has returns and can no longer be edited");
  const customerChanged = (input.customer_id ?? null) !== (existing.customer_id === null ? null : Number(existing.customer_id));
  if (customerChanged && num(existing.paid_amount) > 0) {
    throw conflict("The customer cannot be changed after payments were recorded");
  }

  const previous = (unwrap(await supabase.from("sale_items").select("product_id, quantity").eq("sale_id", id)) as Row[])
    .map(row => ({ product_id: Number(row.product_id), quantity: num(row.quantity) }));
  const paid = num(existing.paid_amount) + input.additional_payment;
  const priced = await prepareSale(input, paid, previous);

  if (toCents(paid) > toCents(priced.total)) {
    throw badRequest("The invoice total cannot be lower than the amount already paid");
  }
  if (!input.customer_id && toCents(paid) < toCents(priced.total)) {
    throw badRequest("Walk-in sales must be paid in full. Select a customer to sell on credit.");
  }

  await rpc("erp_update_sale", {
    p_sale_id: id,
    p: { ...salePayload(input, priced), additional_payment: input.additional_payment },
    p_user: user.id,
  });
  return getSale(id);
}

export async function cancelSale(id: number, input: z.infer<typeof cancelSchema>, user: AuthUser) {
  const existing = await getRow("sales", id, "Sale");
  if (existing.status === "cancelled") throw conflict("This sale is already cancelled");
  await rpc("erp_cancel_sale", {
    p_sale_id: id,
    p_refund_method: input.refund_method ?? null,
    p_date: today(),
    p_user: user.id,
  });
  return getSale(id);
}
