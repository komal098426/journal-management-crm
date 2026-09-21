import type { z } from "zod";
import { supabase } from "../config/supabase.js";
import type { AuthUser } from "../middleware/auth.js";
import { rpc, unwrap } from "../utils/db.js";
import { ApiError } from "../utils/errors.js";
import { num } from "../utils/money.js";
import type { ListQuery } from "../utils/query.js";
import type { categorySchema, productCreateSchema, productUpdateSchema, stockAdjustmentSchema } from "../validators/erp.js";
import { crud, deleteRow, getRow, listRows, updateRow } from "./resource.js";

type ProductCreate = z.infer<typeof productCreateSchema>;
type ProductUpdate = z.infer<typeof productUpdateSchema>;

export type ProductFilters = {
  category_id?: number | null;
  supplier_id?: number | null;
  status?: "active" | "inactive";
  stock_status?: "in_stock" | "low_stock" | "out_of_stock";
};

const PRODUCT_SORTS = [
  "name", "sku", "brand", "category_name", "stock_quantity", "minimum_stock",
  "purchase_price", "selling_price", "stock_value", "status", "created_at",
] as const;

export function listProducts(query: ListQuery, filters: ProductFilters) {
  return listRows({
    source: "v_products",
    query,
    sortable: PRODUCT_SORTS,
    defaultSort: "name",
    searchColumns: ["name", "sku", "brand", "category_name"],
    apply: q => {
      if (filters.category_id) q = q.eq("category_id", filters.category_id);
      if (filters.supplier_id) q = q.eq("supplier_id", filters.supplier_id);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.stock_status) q = q.eq("stock_status", filters.stock_status);
      return q;
    },
  });
}

export async function getProduct(id: number): Promise<Awaited<ReturnType<typeof getRow>>> {
  const product = await getRow("v_products", id, "Product");
  const movements = unwrap(
    await supabase.from("v_stock_movements").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(50),
  );
  return { ...product, movements };
}

export async function createProduct(input: ProductCreate, user: AuthUser) {
  const id = await rpc<number>("erp_create_product", { p: input, p_user: user.id });
  return getProduct(Number(id));
}

export async function updateProduct(id: number, input: ProductUpdate) {
  await updateRow("products", id, input, "Product");
  return getProduct(id);
}

export function deleteProduct(id: number) {
  return deleteRow("products", id, "Product", "This product has sales, purchases or adjustments. Mark it inactive instead.");
}

export async function lowStockProducts(limit = 8) {
  return unwrap(
    await supabase.from("v_products").select("id, name, sku, unit, stock_quantity, minimum_stock, stock_status")
      .eq("status", "active").in("stock_status", ["low_stock", "out_of_stock"])
      .order("stock_quantity", { ascending: true }).limit(limit),
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const categories = crud({
  table: "categories",
  label: "Category",
  sortable: ["name", "created_at"],
  defaultSort: "name",
  searchColumns: ["name", "description"],
});

export async function listCategories(query: ListQuery) {
  const result = await listRows({
    source: "categories",
    select: "*, products(count)",
    query,
    sortable: ["name", "created_at"],
    defaultSort: "name",
    searchColumns: ["name", "description"],
  });
  return {
    count: result.count,
    rows: result.rows.map(({ products, ...row }) => ({ ...row, product_count: products?.[0]?.count ?? 0 })),
  };
}

export const getCategory = categories.get;
export const createCategory = (input: z.infer<typeof categorySchema>) => categories.create(input);
export const updateCategory = (id: number, input: z.infer<typeof categorySchema>) => categories.update(id, input);
export const deleteCategory = categories.remove;

// ---------------------------------------------------------------------------
// Stock adjustments & history
// ---------------------------------------------------------------------------
export function listAdjustments(query: ListQuery, productId?: number | null) {
  return listRows({
    source: "v_stock_adjustments",
    query,
    sortable: ["created_at", "quantity", "product_name", "adjustment_type"],
    defaultSort: "created_at",
    searchColumns: ["product_name", "sku", "reason"],
    dateColumn: "created_at",
    dateIsTimestamp: true,
    apply: q => (productId ? q.eq("product_id", productId) : q),
  });
}

export async function createAdjustment(input: z.infer<typeof stockAdjustmentSchema>, user: AuthUser) {
  const product = await getRow("products", input.product_id, "Product");
  if (input.adjustment_type === "decrease" && input.quantity > num(product.stock_quantity)) {
    throw new ApiError(
      409,
      `Cannot remove ${input.quantity} ${product.unit}: only ${num(product.stock_quantity)} ${product.unit} of ${product.name} in stock`,
      "INSUFFICIENT_STOCK",
    );
  }
  const id = await rpc<number>("erp_create_stock_adjustment", { p: input, p_user: user.id });
  return getRow("v_stock_adjustments", Number(id), "Stock adjustment");
}

export function listMovements(query: ListQuery, filters: { product_id?: number | null; movement_type?: string }) {
  return listRows({
    source: "v_stock_movements",
    query,
    sortable: ["created_at", "quantity_change", "product_name", "movement_type"],
    defaultSort: "created_at",
    searchColumns: ["product_name", "sku", "note"],
    dateColumn: "created_at",
    dateIsTimestamp: true,
    apply: q => {
      if (filters.product_id) q = q.eq("product_id", filters.product_id);
      if (filters.movement_type) q = q.eq("movement_type", filters.movement_type);
      return q;
    },
  });
}
