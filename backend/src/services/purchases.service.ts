import type { z } from "zod";
import { supabase } from "../config/supabase.js";
import type { AuthUser } from "../middleware/auth.js";
import { today } from "../utils/dates.js";
import { rpc, unwrap } from "../utils/db.js";
import { ApiError, badRequest, conflict } from "../utils/errors.js";
import { num, round3, toCents } from "../utils/money.js";
import type { ListQuery } from "../utils/query.js";
import type { cancelSchema, purchaseCreateSchema, purchaseUpdateSchema } from "../validators/erp.js";
import { priceInvoice, unitCosts, type PricedInvoice } from "./calculations.js";
import { getRow, listRows, type Row } from "./resource.js";

type PurchaseCreate = z.infer<typeof purchaseCreateSchema>;
type PurchaseUpdate = z.infer<typeof purchaseUpdateSchema>;
type LineQty = { product_id: number; quantity: number };

const SORTS = ["purchase_date", "invoice_number", "supplier_name", "total", "paid_amount", "remaining_amount", "status", "created_at"] as const;

export function listPurchases(query: ListQuery, filters: { status?: string; supplier_id?: number | null }) {
  return listRows({
    source: "v_purchases",
    query,
    sortable: SORTS,
    defaultSort: "purchase_date",
    searchColumns: ["invoice_number", "supplier_name"],
    dateColumn: "purchase_date",
    apply: q => {
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.supplier_id) q = q.eq("supplier_id", filters.supplier_id);
      return q;
    },
  });
}

export async function getPurchase(id: number): Promise<Awaited<ReturnType<typeof getRow>>> {
  const purchase = await getRow("v_purchases", id, "Purchase");
  const [items, returns, allocations] = await Promise.all([
    supabase.from("purchase_items").select("*, product:products(id, name, sku, unit, stock_quantity, status)").eq("purchase_id", id).order("id"),
    supabase.from("v_purchase_returns").select("*").eq("purchase_id", id).order("created_at"),
    supabase.from("payment_allocations")
      .select("amount, payment:payments(id, direction, amount, payment_method, reference, notes, payment_date, created_at)")
      .eq("purchase_id", id).order("id"),
  ]);
  return {
    ...purchase,
    items: unwrap(items),
    returns: unwrap(returns),
    payments: (unwrap(allocations) as Row[]).map(allocation => ({ ...allocation.payment, allocated: num(allocation.amount) })),
  };
}

function totalsByProduct(lines: LineQty[]) {
  const totals = new Map<number, number>();
  for (const line of lines) totals.set(line.product_id, round3((totals.get(line.product_id) ?? 0) + Number(line.quantity)));
  return totals;
}

async function preparePurchase(input: PurchaseCreate | PurchaseUpdate, paid: number, previous: LineQty[] = []) {
  const newTotals = totalsByProduct(input.items);
  const previousTotals = totalsByProduct(previous);
  const productIds = [...new Set([...newTotals.keys(), ...previousTotals.keys()])];
  const products = new Map<number, Row>(
    (unwrap(await supabase.from("products").select("id, name, unit, stock_quantity").in("id", productIds)) as Row[])
      .map(product => [Number(product.id), product]),
  );

  for (const productId of newTotals.keys()) {
    if (!products.has(productId)) throw badRequest(`Product #${productId} was not found`);
  }
  // When an edit lowers a quantity, the difference must still be in stock.
  for (const [productId, oldQty] of previousTotals) {
    const product = products.get(productId);
    if (!product) continue;
    const after = round3(num(product.stock_quantity) - oldQty + (newTotals.get(productId) ?? 0));
    if (after < 0) {
      throw new ApiError(
        409,
        `Cannot reduce ${product.name}: ${round3(-after)} ${product.unit} from this purchase were already sold or used`,
        "INSUFFICIENT_STOCK",
      );
    }
  }

  const supplier = await supabase.from("suppliers").select("id").eq("id", input.supplier_id).maybeSingle();
  if (supplier.error) throw badRequest("Could not verify the supplier");
  if (!supplier.data) throw badRequest("The selected supplier does not exist");

  return priceInvoice(
    {
      lines: input.items.map(item => ({ quantity: item.quantity, price: item.purchase_price, discount: item.discount })),
      discount: input.discount,
      tax: input.tax,
      taxRate: input.tax_rate,
      paid,
    },
    { enforcePaid: false },
  );
}

function purchasePayload(input: PurchaseCreate | PurchaseUpdate, priced: PricedInvoice) {
  const costs = unitCosts(priced);
  return {
    supplier_id: input.supplier_id,
    invoice_number: input.invoice_number,
    purchase_date: input.purchase_date,
    payment_method: input.payment_method,
    notes: input.notes,
    subtotal: priced.subtotal,
    discount: priced.discount,
    tax: priced.tax,
    total: priced.total,
    items: priced.lines.map((line, index) => ({
      product_id: input.items[index].product_id,
      quantity: line.quantity,
      purchase_price: line.price,
      discount: line.discount,
      subtotal: line.subtotal,
      unit_cost: costs[index],
    })),
  };
}

export async function createPurchase(input: PurchaseCreate, user: AuthUser) {
  const priced = await preparePurchase(input, input.paid_amount);
  if (toCents(priced.paid) > toCents(priced.total)) throw badRequest("Paid amount cannot be more than the invoice total");
  const id = await rpc<number>("erp_create_purchase", { p: { ...purchasePayload(input, priced), paid_amount: priced.paid }, p_user: user.id });
  return getPurchase(Number(id));
}

export async function updatePurchase(id: number, input: PurchaseUpdate, user: AuthUser) {
  const existing = await getRow("purchases", id, "Purchase");
  if (existing.status === "cancelled") throw conflict("Cancelled purchases cannot be edited");
  if (num(existing.returned_amount) > 0) throw conflict("This purchase has returns and can no longer be edited");
  if (input.supplier_id !== Number(existing.supplier_id) && num(existing.paid_amount) > 0) {
    throw conflict("The supplier cannot be changed after payments were recorded");
  }

  const previous = (unwrap(await supabase.from("purchase_items").select("product_id, quantity").eq("purchase_id", id)) as Row[])
    .map(row => ({ product_id: Number(row.product_id), quantity: num(row.quantity) }));
  const paid = num(existing.paid_amount) + input.additional_payment;
  const priced = await preparePurchase(input, paid, previous);
  if (toCents(paid) > toCents(priced.total)) {
    throw badRequest("The invoice total cannot be lower than the amount already paid");
  }

  await rpc("erp_update_purchase", {
    p_purchase_id: id,
    p: { ...purchasePayload(input, priced), additional_payment: input.additional_payment },
    p_user: user.id,
  });
  return getPurchase(id);
}

export async function cancelPurchase(id: number, input: z.infer<typeof cancelSchema>, user: AuthUser) {
  const existing = await getRow("purchases", id, "Purchase");
  if (existing.status === "cancelled") throw conflict("This purchase is already cancelled");
  await rpc("erp_cancel_purchase", {
    p_purchase_id: id,
    p_refund_method: input.refund_method ?? null,
    p_date: today(),
    p_user: user.id,
  });
  return getPurchase(id);
}
