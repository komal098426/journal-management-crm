import { can, type Permission } from "../config/permissions.js";
import type { AuthUser } from "../middleware/auth.js";
import { bucketFor, today } from "../utils/dates.js";
import { rpc } from "../utils/db.js";
import { forbidden } from "../utils/errors.js";
import { num, round2 } from "../utils/money.js";
import type { ListQuery } from "../utils/query.js";
import { profitAndLoss } from "./calculations.js";
import { listExpenses, listPayments, type PartyType } from "./finance.service.js";
import { listProducts } from "./inventory.service.js";
import { listCustomers, listSuppliers, type BalanceFilter } from "./parties.service.js";
import { listPurchases } from "./purchases.service.js";
import type { Row } from "./resource.js";
import { listSales } from "./sales.service.js";

export const REPORTS = {
  sales: { title: "Sales", permission: "sales:read" },
  purchases: { title: "Purchases", permission: "purchases:read" },
  inventory: { title: "Inventory", permission: "inventory:read" },
  customers: { title: "Customers", permission: "customers:read" },
  suppliers: { title: "Suppliers", permission: "suppliers:read" },
  expenses: { title: "Expenses", permission: "finance:read" },
  payments: { title: "Payments", permission: "finance:read" },
  "profit-loss": { title: "Profit & Loss", permission: "finance:read" },
} as const satisfies Record<string, { title: string; permission: Permission }>;

export type ReportType = keyof typeof REPORTS;
export type ColumnType = "text" | "money" | "number" | "date" | "status";
export type ReportColumn = { key: string; label: string; type?: ColumnType };
export type SummaryItem = { label: string; value: number; type: "money" | "number" | "percent" };
export type ReportResult = {
  type: ReportType;
  title: string;
  columns: ReportColumn[];
  rows: Row[];
  total: number;
  summary: SummaryItem[];
  paginated: boolean;
};

export function availableReports(user: AuthUser) {
  return (Object.entries(REPORTS) as [ReportType, (typeof REPORTS)[ReportType]][])
    .filter(([, report]) => can(user.role, report.permission))
    .map(([type, report]) => ({ type, title: report.title }));
}

const money = (label: string, value: number): SummaryItem => ({ label, value: round2(value), type: "money" });
const count = (label: string, value: number): SummaryItem => ({ label, value, type: "number" });

export async function runReport(
  type: ReportType,
  query: ListQuery,
  filters: { status?: string; stock_status?: "in_stock" | "low_stock" | "out_of_stock"; balance?: BalanceFilter; category?: string; party_type?: PartyType; direction?: "in" | "out" },
  user: AuthUser,
): Promise<ReportResult> {
  const report = REPORTS[type];
  if (!can(user.role, report.permission)) throw forbidden("You do not have access to this report");
  const from = query.from ?? "2000-01-01";
  const to = query.to ?? today();
  const finance = can(user.role, "finance:read");
  const base = { type, title: report.title, paginated: true };

  switch (type) {
    case "sales": {
      const [list, raw] = await Promise.all([
        listSales(query, { status: filters.status }),
        rpc<Row>("erp_financial_totals", { p_from: from, p_to: to }),
      ]);
      const pl = profitAndLoss(raw);
      return {
        ...base,
        columns: [
          { key: "invoice_number", label: "Invoice" }, { key: "sale_date", label: "Date", type: "date" },
          { key: "customer_name", label: "Customer" }, { key: "items_count", label: "Items", type: "number" },
          { key: "total", label: "Total", type: "money" }, { key: "returned_amount", label: "Returned", type: "money" },
          { key: "paid_amount", label: "Paid", type: "money" }, { key: "remaining_amount", label: "Due", type: "money" },
          { key: "status", label: "Status", type: "status" },
        ],
        rows: list.rows,
        total: list.count,
        summary: [
          count("Invoices", pl.totals.sales_count),
          money("Sales (incl. tax)", pl.totals.sales_total),
          money("Sales returns", pl.totals.sales_returns_total),
          money("Revenue (excl. tax)", pl.revenue),
          ...(finance ? [money("Cost of goods sold", pl.costOfGoodsSold), money("Gross profit", pl.grossProfit)] : []),
        ],
      };
    }

    case "purchases": {
      const [list, raw, position] = await Promise.all([
        listPurchases(query, { status: filters.status }),
        rpc<Row>("erp_financial_totals", { p_from: from, p_to: to }),
        rpc<Row>("erp_position_snapshot", {}),
      ]);
      const pl = profitAndLoss(raw);
      return {
        ...base,
        columns: [
          { key: "invoice_number", label: "Invoice" }, { key: "purchase_date", label: "Date", type: "date" },
          { key: "supplier_name", label: "Supplier" }, { key: "items_count", label: "Items", type: "number" },
          { key: "total", label: "Total", type: "money" }, { key: "returned_amount", label: "Returned", type: "money" },
          { key: "paid_amount", label: "Paid", type: "money" }, { key: "remaining_amount", label: "Payable", type: "money" },
          { key: "status", label: "Status", type: "status" },
        ],
        rows: list.rows,
        total: list.count,
        summary: [
          count("Purchase invoices", pl.totals.purchases_count),
          money("Purchases", pl.totals.purchases_total),
          money("Purchase returns", pl.totals.purchase_returns_total),
          money("Net purchases", pl.netPurchases),
          money("Outstanding payables", num(position.payables)),
        ],
      };
    }

    case "inventory": {
      const [list, position] = await Promise.all([
        listProducts({ ...query, sort: query.sort ?? "name", order: query.sort ? query.order : "asc" }, { stock_status: filters.stock_status }),
        rpc<Row>("erp_position_snapshot", {}),
      ]);
      return {
        ...base,
        columns: [
          { key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "category_name", label: "Category" },
          { key: "stock_quantity", label: "Stock", type: "number" }, { key: "minimum_stock", label: "Minimum", type: "number" },
          { key: "purchase_price", label: "Cost", type: "money" }, { key: "selling_price", label: "Price", type: "money" },
          { key: "stock_value", label: "Stock value", type: "money" }, { key: "stock_status", label: "Status", type: "status" },
        ],
        rows: list.rows,
        total: list.count,
        summary: [
          count("Active products", num(position.products_count)),
          money("Stock value (cost)", num(position.stock_value)),
          money("Stock value (retail)", num(position.stock_retail_value)),
          count("Low stock", num(position.low_stock_count)),
          count("Out of stock", num(position.out_of_stock_count)),
        ],
      };
    }

    case "customers":
    case "suppliers": {
      const isCustomer = type === "customers";
      const listQuery = { ...query, sort: query.sort ?? "balance" };
      const [list, position] = await Promise.all([
        isCustomer ? listCustomers(listQuery, filters.balance) : listSuppliers(listQuery, filters.balance),
        rpc<Row>("erp_position_snapshot", {}),
      ]);
      return {
        ...base,
        columns: [
          { key: "name", label: isCustomer ? "Customer" : "Supplier" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
          { key: isCustomer ? "total_sales" : "total_purchases", label: isCustomer ? "Total sales" : "Total purchases", type: "money" },
          { key: "total_paid", label: "Paid", type: "money" },
          { key: "balance", label: isCustomer ? "Receivable" : "Payable", type: "money" },
        ],
        rows: list.rows,
        total: list.count,
        summary: isCustomer
          ? [count("Customers", num(position.customers_count)), money("Receivables", num(position.receivables)), money("Customer credit", num(position.customer_credit))]
          : [count("Suppliers", num(position.suppliers_count)), money("Payables", num(position.payables)), money("Supplier credit", num(position.supplier_credit))],
      };
    }

    case "expenses": {
      const [list, raw] = await Promise.all([
        listExpenses(query, { category: filters.category }),
        rpc<Row>("erp_financial_totals", { p_from: from, p_to: to }),
      ]);
      const pl = profitAndLoss(raw);
      return {
        ...base,
        columns: [
          { key: "expense_date", label: "Date", type: "date" }, { key: "title", label: "Expense" },
          { key: "category", label: "Category", type: "status" }, { key: "payment_method", label: "Method" },
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows: list.rows,
        total: list.count,
        summary: [
          count("Expenses", pl.totals.expenses_count),
          money("Total expenses", pl.operatingExpenses),
          ...Object.entries(pl.totals.expenses_by_category)
            .sort((a, b) => b[1] - a[1])
            .map(([category, value]) => money(category[0].toUpperCase() + category.slice(1), value)),
        ],
      };
    }

    case "payments": {
      const [list, raw] = await Promise.all([
        listPayments(query, user, { party_type: filters.party_type, direction: filters.direction }),
        rpc<Row>("erp_financial_totals", { p_from: from, p_to: to }),
      ]);
      const cashIn = num(raw.cash_in);
      const cashOut = num(raw.cash_out);
      return {
        ...base,
        columns: [
          { key: "payment_date", label: "Date", type: "date" }, { key: "party_type", label: "Type", type: "status" },
          { key: "party_name", label: "Party" }, { key: "direction", label: "Direction", type: "status" },
          { key: "payment_method", label: "Method" }, { key: "reference", label: "Reference" },
          { key: "amount", label: "Amount", type: "money" },
        ],
        rows: list.rows,
        total: list.count,
        summary: [money("Money in", cashIn), money("Money out", cashOut), money("Net cash flow", cashIn - cashOut)],
      };
    }

    case "profit-loss": {
      const bucket = bucketFor({ from, to, preset: "custom" });
      const [raw, series] = await Promise.all([
        rpc<Row>("erp_financial_totals", { p_from: from, p_to: to }),
        rpc<Row[]>("erp_timeseries", { p_from: from, p_to: to, p_bucket: from === "2000-01-01" ? "month" : bucket }),
      ]);
      const pl = profitAndLoss(raw);
      const rows = series
        .map(row => {
          const revenue = num(row.revenue);
          const cogs = num(row.cost_of_goods);
          const expenses = num(row.expenses_total);
          return {
            id: row.bucket, period: row.bucket, revenue, cost_of_goods: cogs, gross_profit: round2(revenue - cogs),
            expenses, net_profit: round2(revenue - cogs - expenses),
          };
        })
        .filter(row => row.revenue || row.cost_of_goods || row.expenses);
      return {
        ...base,
        paginated: false,
        columns: [
          { key: "period", label: "Period", type: "date" }, { key: "revenue", label: "Revenue", type: "money" },
          { key: "cost_of_goods", label: "Cost of goods", type: "money" }, { key: "gross_profit", label: "Gross profit", type: "money" },
          { key: "expenses", label: "Expenses", type: "money" }, { key: "net_profit", label: "Net profit", type: "money" },
        ],
        rows: rows.reverse(),
        total: rows.length,
        summary: [
          money("Gross sales (excl. tax)", pl.grossSales),
          money("Sales returns", pl.salesReturns),
          money("Revenue", pl.revenue),
          money("Cost of goods sold", pl.costOfGoodsSold),
          money("Gross profit", pl.grossProfit),
          money("Operating expenses", pl.operatingExpenses),
          money("Net profit", pl.netProfit),
          { label: "Net margin", value: pl.netMargin, type: "percent" },
        ],
      };
    }
  }
}
