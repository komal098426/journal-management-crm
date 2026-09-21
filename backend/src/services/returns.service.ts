import type { z } from "zod";
import { supabase } from "../config/supabase.js";
import type { AuthUser } from "../middleware/auth.js";
import { rpc, unwrap } from "../utils/db.js";
import { conflict } from "../utils/errors.js";
import { num } from "../utils/money.js";
import type { ListQuery } from "../utils/query.js";
import type { purchaseReturnSchema, salesReturnSchema } from "../validators/erp.js";
import { valueReturn } from "./calculations.js";
import { getRow, listRows, type Row } from "./resource.js";

const SORTS = ["return_date", "return_number", "invoice_number", "total_amount", "refund_amount", "created_at"] as const;

// ---------------------------------------------------------------------------
// Sales returns
// ---------------------------------------------------------------------------
export function listSalesReturns(query: ListQuery, filters: { sale_id?: number | null; customer_id?: number | null }) {
  return listRows({
    source: "v_sales_returns",
    query,
    sortable: [...SORTS, "customer_name"],
    defaultSort: "return_date",
    searchColumns: ["return_number", "invoice_number", "customer_name"],
    dateColumn: "return_date",
    apply: q => {
      if (filters.sale_id) q = q.eq("sale_id", filters.sale_id);
      if (filters.customer_id) q = q.eq("customer_id", filters.customer_id);
      return q;
    },
  });
}

export async function getSalesReturn(id: number): Promise<Awaited<ReturnType<typeof getRow>>> {
  const header = await getRow("v_sales_returns", id, "Sales return");
  const items = unwrap(
    await supabase.from("sales_return_items").select("*, product:products(id, name, sku, unit)").eq("return_id", id).order("id"),
  );
  return { ...header, items };
}

export async function createSalesReturn(input: z.infer<typeof salesReturnSchema>, user: AuthUser) {
  const sale = await getRow("sales", input.sale_id, "Sale");
  if (sale.status === "cancelled") throw conflict("Items cannot be returned on a cancelled sale");

  const [lines, previous] = await Promise.all([
    supabase.from("sale_items").select("id, quantity, returned_quantity, subtotal").eq("sale_id", sale.id).order("id"),
    supabase.from("sales_returns").select("tax_amount").eq("sale_id", sale.id),
  ]);

  const valued = valueReturn(
    {
      total: num(sale.total),
      tax: num(sale.tax),
      returned_amount: num(sale.returned_amount),
      returned_tax: (unwrap(previous) as Row[]).reduce((sum, row) => sum + num(row.tax_amount), 0),
      lines: (unwrap(lines) as Row[]).map(line => ({
        id: Number(line.id), quantity: num(line.quantity), returned_quantity: num(line.returned_quantity), subtotal: num(line.subtotal),
      })),
    },
    input.items.map(item => ({ lineId: item.sale_item_id, quantity: item.quantity })),
  );

  const id = await rpc<number>("erp_create_sales_return", {
    p: {
      sale_id: sale.id,
      return_date: input.return_date,
      reason: input.reason,
      refund_method: input.refund_method ?? null,
      tax_amount: valued.tax,
      items: valued.items.map(item => ({ sale_item_id: item.lineId, quantity: item.quantity, amount: item.amount })),
    },
    p_user: user.id,
  });
  return getSalesReturn(Number(id));
}

// ---------------------------------------------------------------------------
// Purchase returns
// ---------------------------------------------------------------------------
export function listPurchaseReturns(query: ListQuery, filters: { purchase_id?: number | null; supplier_id?: number | null }) {
  return listRows({
    source: "v_purchase_returns",
    query,
    sortable: [...SORTS, "supplier_name"],
    defaultSort: "return_date",
    searchColumns: ["return_number", "invoice_number", "supplier_name"],
    dateColumn: "return_date",
    apply: q => {
      if (filters.purchase_id) q = q.eq("purchase_id", filters.purchase_id);
      if (filters.supplier_id) q = q.eq("supplier_id", filters.supplier_id);
      return q;
    },
  });
}

export async function getPurchaseReturn(id: number): Promise<Awaited<ReturnType<typeof getRow>>> {
  const header = await getRow("v_purchase_returns", id, "Purchase return");
  const items = unwrap(
    await supabase.from("purchase_return_items").select("*, product:products(id, name, sku, unit)").eq("return_id", id).order("id"),
  );
  return { ...header, items };
}

export async function createPurchaseReturn(input: z.infer<typeof purchaseReturnSchema>, user: AuthUser) {
  const purchase = await getRow("purchases", input.purchase_id, "Purchase");
  if (purchase.status === "cancelled") throw conflict("Items cannot be returned on a cancelled purchase");

  const [lines, previous] = await Promise.all([
    supabase.from("purchase_items").select("id, quantity, returned_quantity, subtotal, product_id").eq("purchase_id", purchase.id).order("id"),
    supabase.from("purchase_returns").select("tax_amount").eq("purchase_id", purchase.id),
  ]);
  const lineRows = unwrap(lines) as Row[];

  // Returned goods must still be on hand.
  const productIds = [...new Set(lineRows.map(line => Number(line.product_id)))];
  const products = new Map<number, Row>(
    (unwrap(await supabase.from("products").select("id, name, unit, stock_quantity").in("id", productIds)) as Row[])
      .map(product => [Number(product.id), product]),
  );
  const requiredByProduct = new Map<number, number>();
  for (const item of input.items) {
    const line = lineRows.find(row => Number(row.id) === item.purchase_item_id);
    if (!line) continue;
    const productId = Number(line.product_id);
    requiredByProduct.set(productId, (requiredByProduct.get(productId) ?? 0) + item.quantity);
  }
  for (const [productId, required] of requiredByProduct) {
    const product = products.get(productId);
    if (product && required > num(product.stock_quantity)) {
      throw conflict(`Cannot return ${required} ${product.unit} of ${product.name}: only ${num(product.stock_quantity)} in stock`);
    }
  }

  const valued = valueReturn(
    {
      total: num(purchase.total),
      tax: num(purchase.tax),
      returned_amount: num(purchase.returned_amount),
      returned_tax: (unwrap(previous) as Row[]).reduce((sum, row) => sum + num(row.tax_amount), 0),
      lines: lineRows.map(line => ({
        id: Number(line.id), quantity: num(line.quantity), returned_quantity: num(line.returned_quantity), subtotal: num(line.subtotal),
      })),
    },
    input.items.map(item => ({ lineId: item.purchase_item_id, quantity: item.quantity })),
  );

  const id = await rpc<number>("erp_create_purchase_return", {
    p: {
      purchase_id: purchase.id,
      return_date: input.return_date,
      reason: input.reason,
      refund_method: input.refund_method ?? null,
      tax_amount: valued.tax,
      items: valued.items.map(item => ({ purchase_item_id: item.lineId, quantity: item.quantity, amount: item.amount })),
    },
    p_user: user.id,
  });
  return getPurchaseReturn(Number(id));
}
