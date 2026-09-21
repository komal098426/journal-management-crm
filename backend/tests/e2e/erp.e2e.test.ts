/**
 * End-to-end tests against the real Supabase project in backend/.env.
 *
 * Starts the API in-process, creates throw-away users for every role, and
 * walks the whole business flow. All transactions are dated 2031-01-15 so the
 * profit & loss assertions are isolated from demo data. Test users are deleted
 * afterwards; test documents stay (they are prefixed "E2E").
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createApp } from "../../src/app.js";
import { env } from "../../src/config/env.js";
import type { Role } from "../../src/config/permissions.js";
import { supabase } from "../../src/config/supabase.js";

const DAY = "2031-01-15";
const RUN = Date.now().toString(36);
const PASSWORD = `E2e!${RUN}pass`;
const ROLES: Role[] = ["admin", "manager", "sales_staff", "inventory_staff"];

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
const tokens = {} as Record<Role, string>;
const userIds: string[] = [];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(role: Role | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json: Json = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: response.status, body: json };
}

const as = (role: Role) => ({
  get: (path: string) => call(role, "GET", path),
  post: (path: string, body: unknown = {}) => call(role, "POST", path, body),
  put: (path: string, body: unknown) => call(role, "PUT", path, body),
  del: (path: string) => call(role, "DELETE", path),
});
const admin = as("admin");

async function ok(promise: Promise<{ status: number; body: Json }>, expected = [200, 201]) {
  const result = await promise;
  assert.ok(expected.includes(result.status), `expected ${expected.join("/")}, got ${result.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}

before(async () => {
  server = createApp().listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const role of ROLES) {
    const email = `e2e-${RUN}-${role.replace("_", "-")}@northstar.test`;
    const created = await supabase.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { name: `E2E ${role}` }, app_metadata: { role } });
    assert.ifError(created.error);
    userIds.push(created.data.user!.id);
    await supabase.from("users").update({ role }).eq("id", created.data.user!.id);
    const session = await authClient.auth.signInWithPassword({ email, password: PASSWORD });
    assert.ifError(session.error);
    tokens[role] = session.data.session!.access_token;
  }
});

after(async () => {
  for (const id of userIds) await supabase.auth.admin.deleteUser(id);
  server?.close();
});

describe("ERP end-to-end", () => {
  const ctx: Json = {};

  it("rejects unauthenticated and invalid tokens", async () => {
    assert.equal((await call(null, "GET", "/health")).status, 200);
    assert.equal((await call(null, "GET", "/products")).status, 401);
    const bad = await fetch(`${baseUrl}/api/products`, { headers: { Authorization: "Bearer not-a-token" } });
    assert.equal(bad.status, 401);
    const me = await ok(admin.get("/auth/me"));
    assert.equal(me.user.role, "admin");
    assert.ok(me.permissions.includes("users:manage"));
  });

  it("creates master data and prevents duplicate SKUs", async () => {
    ctx.supplier = await ok(admin.post("/suppliers", { name: `E2E Supplier ${RUN}` }));
    ctx.customer = await ok(admin.post("/customers", { name: `E2E Customer ${RUN}`, email: "not-an-email" }), [400]);
    ctx.customer = await ok(admin.post("/customers", { name: `E2E Customer ${RUN}`, phone: "+92 300 0000000" }));
    ctx.category = await ok(admin.post("/categories", { name: `E2E Category ${RUN}` }));
    ctx.product = await ok(admin.post("/products", {
      name: `E2E Widget ${RUN}`, sku: `E2E-${RUN}`, category_id: ctx.category.id, supplier_id: ctx.supplier.id,
      purchase_price: 0, selling_price: 150, minimum_stock: 5, stock_quantity: 0,
    }));
    assert.equal(ctx.product.stock_quantity, 0);
    const duplicate = await admin.post("/products", { name: "Duplicate", sku: `e2e-${RUN}`, purchase_price: 1, selling_price: 2 });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.error.message, /SKU already exists/);
    const stockEdit = await admin.put(`/products/${ctx.product.id}`, { stock_quantity: 999 });
    assert.equal(stockEdit.status, 400);
  });

  it("purchase increases stock, sets cost and records the supplier payable", async () => {
    ctx.purchase = await ok(admin.post("/purchases", {
      supplier_id: ctx.supplier.id, purchase_date: DAY, payment_method: "bank", paid_amount: 400,
      items: [{ product_id: ctx.product.id, quantity: 10, purchase_price: 100 }],
    }));
    assert.equal(ctx.purchase.total, 1000);
    assert.equal(ctx.purchase.status, "partial");
    assert.equal(ctx.purchase.remaining_amount, 600);
    const product = await ok(admin.get(`/products/${ctx.product.id}`));
    assert.equal(product.stock_quantity, 10);
    assert.equal(product.purchase_price, 100);
    const supplier = await ok(admin.get(`/suppliers/${ctx.supplier.id}`));
    assert.equal(supplier.balance, 600);
    assert.equal(supplier.total_paid, 400);
  });

  it("sale decreases stock and records the customer receivable", async () => {
    ctx.sale = await ok(admin.post("/sales", {
      customer_id: ctx.customer.id, sale_date: DAY, payment_method: "cash", paid_amount: 100,
      items: [{ product_id: ctx.product.id, quantity: 3, selling_price: 150 }],
    }));
    assert.equal(ctx.sale.total, 450);
    assert.equal(ctx.sale.remaining_amount, 350);
    assert.equal(ctx.sale.items[0].cost_price, 100);
    assert.equal((await ok(admin.get(`/products/${ctx.product.id}`))).stock_quantity, 7);
    assert.equal((await ok(admin.get(`/customers/${ctx.customer.id}`))).balance, 350);
  });

  it("blocks overselling, invalid quantities and unpaid walk-in sales", async () => {
    const oversell = await admin.post("/sales", {
      customer_id: ctx.customer.id, sale_date: DAY, payment_method: "cash",
      items: [{ product_id: ctx.product.id, quantity: 8, selling_price: 150 }],
    });
    assert.equal(oversell.status, 409);
    assert.equal(oversell.body.error.code, "INSUFFICIENT_STOCK");
    const zero = await admin.post("/sales", { customer_id: ctx.customer.id, sale_date: DAY, payment_method: "cash", items: [{ product_id: ctx.product.id, quantity: 0, selling_price: 1 }] });
    assert.equal(zero.status, 400);
    const walkIn = await admin.post("/sales", { sale_date: DAY, payment_method: "cash", paid_amount: 10, items: [{ product_id: ctx.product.id, quantity: 1, selling_price: 150 }] });
    assert.equal(walkIn.status, 400);
    const overpaid = await admin.post("/sales", { customer_id: ctx.customer.id, sale_date: DAY, payment_method: "cash", paid_amount: 999, items: [{ product_id: ctx.product.id, quantity: 1, selling_price: 150 }] });
    assert.equal(overpaid.status, 400);
    assert.equal((await ok(admin.get(`/products/${ctx.product.id}`))).stock_quantity, 7, "failed sales must not touch stock");
  });

  it("customer payments reduce the receivable and reject overpayment", async () => {
    const tooMuch = await admin.post("/payments", { party_type: "customer", customer_id: ctx.customer.id, amount: 1000, payment_method: "cash", payment_date: DAY });
    assert.equal(tooMuch.status, 400);
    await ok(admin.post("/payments", { party_type: "customer", customer_id: ctx.customer.id, amount: 200, payment_method: "bank", payment_date: DAY, reference: "E2E" }));
    assert.equal((await ok(admin.get(`/customers/${ctx.customer.id}`))).balance, 150);
    const sale = await ok(admin.get(`/sales/${ctx.sale.id}`));
    assert.equal(sale.paid_amount, 300);
    assert.equal(sale.remaining_amount, 150);
  });

  it("supplier payments reduce the payable", async () => {
    await ok(admin.post("/payments", { party_type: "supplier", supplier_id: ctx.supplier.id, amount: 600, payment_method: "bank", payment_date: DAY }));
    assert.equal((await ok(admin.get(`/suppliers/${ctx.supplier.id}`))).balance, 0);
    const again = await admin.post("/payments", { party_type: "supplier", supplier_id: ctx.supplier.id, amount: 1, payment_method: "bank", payment_date: DAY });
    assert.equal(again.status, 409);
    assert.equal((await ok(admin.get(`/purchases/${ctx.purchase.id}`))).status, "paid");
  });

  it("sales return restocks and reduces the receivable", async () => {
    const tooMany = await admin.post("/sales-returns", { sale_id: ctx.sale.id, return_date: DAY, items: [{ sale_item_id: ctx.sale.items[0].id, quantity: 4 }] });
    assert.equal(tooMany.status, 400);
    const ret = await ok(admin.post("/sales-returns", { sale_id: ctx.sale.id, return_date: DAY, reason: "E2E", items: [{ sale_item_id: ctx.sale.items[0].id, quantity: 1 }] }));
    assert.equal(ret.total_amount, 150);
    assert.equal(ret.receivable_adjusted, 150);
    assert.equal(ret.refund_amount, 0);
    assert.equal((await ok(admin.get(`/products/${ctx.product.id}`))).stock_quantity, 8);
    assert.equal((await ok(admin.get(`/customers/${ctx.customer.id}`))).balance, 0);
    const edit = await admin.put(`/sales/${ctx.sale.id}`, {
      customer_id: ctx.customer.id, sale_date: DAY, payment_method: "cash", items: [{ product_id: ctx.product.id, quantity: 3, selling_price: 150 }],
    });
    assert.equal(edit.status, 409, "sales with returns cannot be edited");
  });

  it("purchase return removes stock and records the supplier refund", async () => {
    const ret = await ok(admin.post("/purchase-returns", {
      purchase_id: ctx.purchase.id, return_date: DAY, refund_method: "bank", items: [{ purchase_item_id: ctx.purchase.items[0].id, quantity: 2 }],
    }));
    assert.equal(ret.total_amount, 200);
    assert.equal(ret.refund_amount, 200, "payable was already settled, so the supplier refunds");
    assert.equal((await ok(admin.get(`/products/${ctx.product.id}`))).stock_quantity, 6);
    const supplier = await ok(admin.get(`/suppliers/${ctx.supplier.id}`));
    assert.equal(supplier.total_purchases, 800);
    assert.equal(supplier.balance, 0);
  });

  it("edits and cancels a sale with correct stock and cash effects", async () => {
    const sale = await ok(admin.post("/sales", {
      customer_id: ctx.customer.id, sale_date: DAY, payment_method: "cash", paid_amount: 150,
      items: [{ product_id: ctx.product.id, quantity: 2, selling_price: 150 }],
    }));
    assert.equal((await ok(admin.get(`/products/${ctx.product.id}`))).stock_quantity, 4);
    const edited = await ok(admin.put(`/sales/${sale.id}`, {
      customer_id: ctx.customer.id, sale_date: DAY, payment_method: "cash", additional_payment: 0,
      items: [{ product_id: ctx.product.id, quantity: 1, selling_price: 150 }],
    }));
    assert.equal(edited.total, 150);
    assert.equal(edited.status, "paid");
    assert.equal((await ok(admin.get(`/products/${ctx.product.id}`))).stock_quantity, 5);
    const lower = await admin.put(`/sales/${sale.id}`, {
      customer_id: ctx.customer.id, sale_date: DAY, payment_method: "cash", items: [{ product_id: ctx.product.id, quantity: 1, selling_price: 100 }],
    });
    assert.equal(lower.status, 400, "total cannot drop below the amount paid");

    const cancelled = await ok(admin.post(`/sales/${sale.id}/cancel`, { refund_method: "cash" }));
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.paid_amount, 0);
    assert.ok(cancelled.payments.some((p: Json) => p.allocated === -150), "refund recorded");
    assert.equal((await ok(admin.get(`/products/${ctx.product.id}`))).stock_quantity, 6);
    assert.equal((await ok(admin.get(`/customers/${ctx.customer.id}`))).balance, 0);
    assert.equal((await admin.post(`/sales/${sale.id}/cancel`)).status, 409);
  });

  it("records expenses and calculates profit & loss from transactions", async () => {
    await ok(admin.post("/expenses", { title: `E2E rent ${RUN}`, category: "rent", amount: 50, payment_method: "cash", expense_date: DAY }));
    const report = await ok(admin.get(`/reports/profit-loss?from=${DAY}&to=${DAY}`));
    const line = (label: string) => report.summary.find((item: Json) => item.label === label)?.value;
    // Revenue 450 − 150 returned = 300; COGS 3×100 − 1×100 = 200; the cancelled sale is excluded.
    assert.equal(line("Revenue"), 300);
    assert.equal(line("Cost of goods sold"), 200);
    assert.equal(line("Gross profit"), 100);
    assert.equal(line("Operating expenses"), 50);
    assert.equal(line("Net profit"), 50);

    const dashboard = await ok(admin.get(`/dashboard?range=custom&from=${DAY}&to=${DAY}`));
    assert.equal(dashboard.metrics.revenue.value, 300);
    assert.equal(dashboard.metrics.net_profit.value, 50);
    assert.equal(dashboard.metrics.total_purchases.value, 1000);
    assert.equal(dashboard.series.length, 1);
    assert.equal(dashboard.series[0].profit, 50);

    const csv = await fetch(`${baseUrl}/api/reports/sales?from=${DAY}&to=${DAY}&format=csv`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(await csv.text(), /Invoice,Date,Customer/);
  });

  it("enforces role-based authorization in the API", async () => {
    const sales = as("sales_staff");
    const stock = as("inventory_staff");
    const manager = as("manager");

    assert.equal((await sales.get("/purchases")).status, 403);
    assert.equal((await sales.get("/reports/profit-loss")).status, 403);
    assert.equal((await sales.post("/products", { name: "x", sku: "x", purchase_price: 1, selling_price: 1 })).status, 403);
    assert.equal((await sales.get("/products")).status, 200);
    assert.equal((await sales.get("/customers")).status, 200);
    const sale = await sales.post("/sales", { sale_date: DAY, payment_method: "cash", paid_amount: 150, items: [{ product_id: ctx.product.id, quantity: 1, selling_price: 150 }] });
    assert.equal(sale.status, 201, JSON.stringify(sale.body));
    assert.equal((await sales.post(`/sales/${sale.body.id}/cancel`)).status, 403);
    const salesDashboard = await ok(sales.get("/dashboard"));
    assert.equal(salesDashboard.metrics.net_profit, null, "sales staff must not see profit");

    assert.equal((await stock.post("/sales", {})).status, 403);
    assert.equal((await stock.get("/customers")).status, 403);
    assert.equal((await stock.get("/expenses")).status, 403);
    assert.equal((await stock.get("/suppliers")).status, 200);
    const payments = await ok(stock.get("/payments"));
    assert.ok(payments.data.every((p: Json) => p.party_type === "supplier"), "inventory staff only see supplier payments");

    assert.equal((await manager.get("/expenses")).status, 403);
    assert.equal((await manager.get("/reports/profit-loss")).status, 200);
    assert.equal((await manager.post("/auth/users", { email: "x@y.test", password: "password1", name: "X", role: "admin" })).status, 403);
    assert.equal((await manager.get("/employees")).status, 403);

    assert.equal((await admin.get("/employees")).status, 200);
    assert.equal((await admin.get("/auth/users")).status, 200);

    // Clean up the extra stock movement from the sales-staff sale.
    await ok(admin.post(`/sales/${sale.body.id}/cancel`, {}));
  });

  it("protects referenced records from deletion", async () => {
    const del = await admin.del(`/customers/${ctx.customer.id}`);
    assert.equal(del.status, 409);
    const product = await admin.del(`/products/${ctx.product.id}`);
    assert.equal(product.status, 409);
    const missing = await admin.get("/sales/999999999");
    assert.equal(missing.status, 404);
    assert.equal((await admin.get("/sales?sort=drop_table")).status, 400);
  });

  it("keeps every stored balance consistent with its transactions", async () => {
    const { data, error } = await supabase.rpc("erp_integrity_check");
    assert.ifError(error);
    for (const [check, rows] of Object.entries(data as Record<string, unknown[]>)) {
      assert.deepEqual(rows, [], `${check} should be empty`);
    }
  });
});
