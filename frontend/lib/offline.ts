import type { Dashboard, Me, Permission, ReportType, Settings } from "@/types/erp";

/**
 * Set NEXT_PUBLIC_BACKEND_DISABLED=true to browse the UI without the Node API:
 * sign-in is skipped, reads return empty data and writes are refused.
 */
export const BACKEND_DISABLED = process.env.NEXT_PUBLIC_BACKEND_DISABLED === "true";

const ALL_PERMISSIONS: Permission[] = [
  "dashboard:read", "finance:read", "reports:read",
  "sales:read", "sales:write", "sales:cancel",
  "customers:read", "customers:write", "customers:delete",
  "purchases:read", "purchases:write", "purchases:cancel",
  "suppliers:read", "suppliers:write", "suppliers:delete",
  "inventory:read", "inventory:write", "inventory:delete",
  "expenses:read", "expenses:write",
  "hr:read", "hr:write",
  "users:manage", "settings:write",
];

export const OFFLINE_ME: Me = {
  user: { id: "offline-demo", email: "demo@northstar.local", name: "Demo Admin", role: "admin" },
  permissions: ALL_PERMISSIONS,
};

const SETTINGS: Settings = {
  company_name: "Northstar Operations",
  timezone: "Asia/Karachi",
  currency: "PKR",
  invoice_footer: "Thank you for your business.",
  low_stock_alerts: true,
};

const REPORTS: { type: ReportType; title: string }[] = [
  { type: "sales", title: "Sales" },
  { type: "purchases", title: "Purchases" },
  { type: "inventory", title: "Inventory" },
  { type: "customers", title: "Customers" },
  { type: "suppliers", title: "Suppliers" },
  { type: "expenses", title: "Expenses" },
  { type: "payments", title: "Payments" },
  { type: "profit-loss", title: "Profit & Loss" },
];

function today() {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function emptyDashboard(): Dashboard {
  const zero = { value: 0, count: 0, returns: 0, margin: 0, cogs: 0, customers: 0, suppliers: 0, stock_value: 0, low: 0, out: 0 };
  const date = today();
  return {
    range: { from: `${date.slice(0, 8)}01`, to: date, preset: "month", bucket: "day", today: date },
    metrics: {
      total_sales: zero, total_purchases: zero, revenue: zero, expenses: zero, gross_profit: zero, net_profit: zero,
      receivables: zero, payables: zero, total_products: zero, low_stock: zero, todays_sales: zero, todays_purchases: zero,
    },
    series: [],
    cash_by_method: {},
    recent: [],
    low_stock_products: [],
  };
}

export class OfflineError extends Error {}

/** Empty response for a GET while the backend is disabled. */
export function offlineGet(path: string, query: Record<string, unknown> = {}): unknown {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 20);
  if (path === "/auth/me") return OFFLINE_ME;
  if (path === "/auth/settings") return SETTINGS;
  if (path === "/auth/users" || path === "/products/low-stock") return { data: [] };
  if (path === "/dashboard") return emptyDashboard();
  if (path === "/reports") return { data: REPORTS };
  if (path.startsWith("/reports/")) {
    return { type: path.slice(9), title: "", columns: [], rows: [], total: 0, page, pageSize, paginated: true, summary: [] };
  }
  // Detail pages (/sales/12, /customers/3, …) have no record to show.
  if (/\/\d+(\/|$)/.test(path)) throw new OfflineError("This record is unavailable while the backend is disabled.");
  return { data: [], total: 0, page, pageSize };
}
