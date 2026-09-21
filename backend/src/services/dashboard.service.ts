import { can } from "../config/permissions.js";
import { supabase } from "../config/supabase.js";
import type { AuthUser } from "../middleware/auth.js";
import { bucketFor, today, type DateRange } from "../utils/dates.js";
import { rpc, unwrap } from "../utils/db.js";
import { num, round2 } from "../utils/money.js";
import { profitAndLoss } from "./calculations.js";
import { visiblePartyTypes } from "./finance.service.js";
import { lowStockProducts } from "./inventory.service.js";
import type { Row } from "./resource.js";

type Activity = {
  kind: "sale" | "purchase" | "payment";
  id: number;
  title: string;
  subtitle: string;
  amount: number;
  status: string;
  date: string;
  created_at: string;
  href: string | null;
};

/** Every number here comes from the database; nothing is hardcoded. */
export async function getDashboard(user: AuthUser, range: DateRange) {
  const finance = can(user.role, "finance:read");
  const sales = can(user.role, "sales:read");
  const purchases = can(user.role, "purchases:read");
  const inventory = can(user.role, "inventory:read");
  const current = today();
  const bucket = bucketFor(range);

  const [periodRaw, todayRaw, position, seriesRows, recent, lowStock] = await Promise.all([
    rpc<Row>("erp_financial_totals", { p_from: range.from, p_to: range.to }),
    rpc<Row>("erp_financial_totals", { p_from: current, p_to: current }),
    rpc<Row>("erp_position_snapshot", {}),
    rpc<Row[]>("erp_timeseries", { p_from: range.from, p_to: range.to, p_bucket: bucket }),
    recentActivity(user),
    inventory ? lowStockProducts(6) : Promise.resolve([]),
  ]);

  const period = profitAndLoss(periodRaw);
  const day = profitAndLoss(todayRaw);
  const metric = (allowed: boolean, value: number, extra: Record<string, number> = {}) => (allowed ? { value, ...extra } : null);

  return {
    range: { ...range, bucket, today: current },
    metrics: {
      total_sales: metric(sales, period.totals.sales_total, { count: period.totals.sales_count }),
      total_purchases: metric(purchases, period.totals.purchases_total, { count: period.totals.purchases_count }),
      revenue: metric(finance, period.revenue, { returns: period.salesReturns }),
      expenses: metric(finance, period.operatingExpenses, { count: period.totals.expenses_count }),
      gross_profit: metric(finance, period.grossProfit, { margin: period.grossMargin, cogs: period.costOfGoodsSold }),
      net_profit: metric(finance, period.netProfit, { margin: period.netMargin }),
      receivables: metric(sales || finance, num(position.receivables), { customers: num(position.customers_count) }),
      payables: metric(purchases || finance, num(position.payables), { suppliers: num(position.suppliers_count) }),
      total_products: metric(inventory, num(position.products_count), { stock_value: num(position.stock_value) }),
      low_stock: metric(inventory, num(position.low_stock_count) + num(position.out_of_stock_count), {
        low: num(position.low_stock_count),
        out: num(position.out_of_stock_count),
      }),
      todays_sales: metric(sales, day.totals.sales_total, { count: day.totals.sales_count }),
      todays_purchases: metric(purchases, day.totals.purchases_total, { count: day.totals.purchases_count }),
    },
    series: seriesRows.map(row => {
      const revenue = num(row.revenue);
      const expenses = num(row.expenses_total);
      return {
        bucket: row.bucket as string,
        sales: sales ? num(row.sales_total) : null,
        purchases: purchases ? num(row.purchases_total) : null,
        revenue: finance ? revenue : null,
        expenses: finance ? expenses : null,
        profit: finance ? round2(revenue - num(row.cost_of_goods) - expenses) : null,
      };
    }),
    cash_by_method: finance ? (position.cash_by_method as Record<string, number>) : null,
    recent,
    low_stock_products: lowStock,
  };
}

async function recentActivity(user: AuthUser): Promise<Activity[]> {
  const jobs: Promise<Activity[]>[] = [];

  if (can(user.role, "sales:read")) {
    jobs.push(Promise.resolve(
      supabase.from("v_sales").select("id, invoice_number, customer_name, total, status, sale_date, created_at")
        .order("created_at", { ascending: false }).limit(6),
    ).then(result => (unwrap(result) as Row[]).map(sale => ({
      kind: "sale" as const, id: sale.id, title: sale.customer_name, subtitle: `Sale · ${sale.invoice_number}`,
      amount: num(sale.total), status: sale.status, date: sale.sale_date, created_at: sale.created_at, href: `/sales/${sale.id}`,
    }))));
  }

  if (can(user.role, "purchases:read")) {
    jobs.push(Promise.resolve(
      supabase.from("v_purchases").select("id, invoice_number, supplier_name, total, status, purchase_date, created_at")
        .order("created_at", { ascending: false }).limit(6),
    ).then(result => (unwrap(result) as Row[]).map(purchase => ({
      kind: "purchase" as const, id: purchase.id, title: purchase.supplier_name, subtitle: `Purchase · ${purchase.invoice_number}`,
      amount: num(purchase.total), status: purchase.status, date: purchase.purchase_date, created_at: purchase.created_at,
      href: `/purchases/${purchase.id}`,
    }))));
  }

  const parties = visiblePartyTypes(user);
  if (parties.length) {
    jobs.push(Promise.resolve(
      supabase.from("v_payments").select("id, party_type, party_name, direction, amount, payment_method, payment_date, created_at, customer_id, supplier_id")
        .in("party_type", parties).order("created_at", { ascending: false }).limit(6),
    ).then(result => (unwrap(result) as Row[]).map(payment => ({
      kind: "payment" as const, id: payment.id, title: payment.party_name,
      subtitle: `${payment.direction === "in" ? "Received" : "Paid"} · ${String(payment.payment_method).replace("_", " ")}`,
      amount: num(payment.amount), status: payment.direction === "in" ? "Received" : "Paid",
      date: payment.payment_date, created_at: payment.created_at,
      href: payment.customer_id ? `/customers/${payment.customer_id}` : payment.supplier_id ? `/suppliers/${payment.supplier_id}` : null,
    }))));
  }

  const groups = await Promise.all(jobs);
  return groups.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
}
