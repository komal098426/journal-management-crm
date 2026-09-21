export type Role = "admin" | "manager" | "sales_staff" | "inventory_staff";

export type Permission =
  | "dashboard:read" | "finance:read" | "reports:read"
  | "sales:read" | "sales:write" | "sales:cancel"
  | "customers:read" | "customers:write" | "customers:delete"
  | "purchases:read" | "purchases:write" | "purchases:cancel"
  | "suppliers:read" | "suppliers:write" | "suppliers:delete"
  | "inventory:read" | "inventory:write" | "inventory:delete"
  | "expenses:read" | "expenses:write"
  | "hr:read" | "hr:write"
  | "users:manage" | "settings:write";

export type Me = { user: { id: string; email: string; name: string; role: Role }; permissions: Permission[] };

export type Paginated<T> = { data: T[]; total: number; page: number; pageSize: number };

export type PaymentMethod = "cash" | "bank" | "card" | "online_transfer";
export type InvoiceStatus = "paid" | "partial" | "unpaid" | "returned" | "cancelled";

export interface Settings {
  company_name: string;
  timezone: string;
  currency: string;
  invoice_footer: string;
  low_stock_alerts: boolean;
  updated_at?: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  created_at: string;
}

// Inventory ------------------------------------------------------------------
export interface Category {
  id: number;
  name: string;
  description: string | null;
  product_count?: number;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  category_id: number | null;
  category_name: string | null;
  brand: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  stock_quantity: number;
  minimum_stock: number;
  stock_value: number;
  supplier_id: number | null;
  supplier_name: string | null;
  image: string | null;
  description: string | null;
  status: "active" | "inactive";
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
  created_at: string;
}

export interface StockMovement {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  unit: string;
  movement_type: string;
  quantity_change: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: number | null;
  note: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface ProductDetail extends Product {
  movements: StockMovement[];
}

export interface StockAdjustment {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  unit: string;
  adjustment_type: "increase" | "decrease";
  quantity: number;
  reason: string;
  created_by_name: string | null;
  created_at: string;
}

// Parties --------------------------------------------------------------------
export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  total_sales: number;
  total_paid: number;
  balance: number;
  created_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  total_purchases: number;
  total_paid: number;
  balance: number;
  created_at: string;
}

export interface PartyTransaction {
  id: string;
  date: string;
  created_at: string;
  type: "sale" | "purchase" | "payment" | "refund" | "return";
  reference: string;
  description: string;
  amount: number;
  status?: string;
  link?: { kind: "sale" | "purchase"; id: number };
}

export interface OpenInvoice {
  id: number;
  invoice_number: string;
  date: string;
  total: number;
  remaining: number;
}

export interface CustomerDetail extends Customer {
  summary: { invoices: number; returns: number; last_sale_date: string | null };
  open_invoices: OpenInvoice[];
  transactions: PartyTransaction[];
}

export interface SupplierDetail extends Supplier {
  summary: { invoices: number; returns: number; last_purchase_date: string | null };
  open_invoices: OpenInvoice[];
  products: { id: number; name: string; sku: string; stock_quantity: number; unit: string }[];
  transactions: PartyTransaction[];
}

// Sales & purchases ------------------------------------------------------------
interface InvoiceBase {
  id: number;
  invoice_number: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  returned_amount: number;
  paid_amount: number;
  remaining_amount: number;
  payment_method: PaymentMethod;
  status: InvoiceStatus;
  notes: string | null;
  items_count: number;
  cancelled_at: string | null;
  created_at: string;
}

export interface Sale extends InvoiceBase {
  customer_id: number | null;
  customer_name: string;
  sale_date: string;
}

export interface Purchase extends InvoiceBase {
  supplier_id: number;
  supplier_name: string;
  purchase_date: string;
}

type LineProduct = { id: number; name: string; sku: string; unit: string; stock_quantity: number; status: string };

export interface SaleItem {
  id: number;
  product_id: number;
  quantity: number;
  selling_price: number;
  cost_price: number;
  discount: number;
  subtotal: number;
  returned_quantity: number;
  product: LineProduct;
}

export interface PurchaseItem {
  id: number;
  product_id: number;
  quantity: number;
  purchase_price: number;
  discount: number;
  subtotal: number;
  returned_quantity: number;
  product: LineProduct;
}

export interface AllocatedPayment {
  id: number;
  direction: "in" | "out";
  amount: number;
  payment_method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  payment_date: string;
  created_at: string;
  allocated: number;
}

export interface SalesReturn {
  id: number;
  return_number: string;
  sale_id: number;
  customer_id: number | null;
  customer_name: string;
  invoice_number: string;
  total_amount: number;
  tax_amount: number;
  cost_amount: number;
  receivable_adjusted: number;
  refund_amount: number;
  refund_method: PaymentMethod | null;
  return_date: string;
  reason: string | null;
  created_at: string;
}

export interface PurchaseReturn {
  id: number;
  return_number: string;
  purchase_id: number;
  supplier_id: number;
  supplier_name: string;
  invoice_number: string;
  total_amount: number;
  tax_amount: number;
  payable_adjusted: number;
  refund_amount: number;
  refund_method: PaymentMethod | null;
  return_date: string;
  reason: string | null;
  created_at: string;
}

export interface SaleDetail extends Sale {
  items: SaleItem[];
  returns: SalesReturn[];
  payments: AllocatedPayment[];
}

export interface PurchaseDetail extends Purchase {
  items: PurchaseItem[];
  returns: PurchaseReturn[];
  payments: AllocatedPayment[];
}

export interface ReturnDetail<T> {
  items: (T & { product: { id: number; name: string; sku: string; unit: string } })[];
}

// Finance --------------------------------------------------------------------
export interface Payment {
  id: number;
  party_type: "customer" | "supplier" | "expense";
  direction: "in" | "out";
  customer_id: number | null;
  supplier_id: number | null;
  expense_id: number | null;
  amount: number;
  payment_method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  payment_date: string;
  party_name: string;
  expense_category: string | null;
  created_at: string;
}

export interface Expense {
  id: number;
  title: string;
  category: string;
  amount: number;
  payment_method: PaymentMethod;
  expense_date: string;
  description: string | null;
  receipt: string | null;
  created_at: string;
}

// Dashboard & reports --------------------------------------------------------------
export type Metric = ({ value: number } & Record<string, number>) | null;

export interface Dashboard {
  range: { from: string; to: string; preset: string; bucket: "day" | "week" | "month"; today: string };
  metrics: Record<
    "total_sales" | "total_purchases" | "revenue" | "expenses" | "gross_profit" | "net_profit" |
    "receivables" | "payables" | "total_products" | "low_stock" | "todays_sales" | "todays_purchases",
    Metric
  >;
  series: { bucket: string; sales: number | null; purchases: number | null; revenue: number | null; expenses: number | null; profit: number | null }[];
  cash_by_method: Record<string, number> | null;
  recent: { kind: string; id: number; title: string; subtitle: string; amount: number; status: string; date: string; created_at: string; href: string | null }[];
  low_stock_products: Pick<Product, "id" | "name" | "sku" | "unit" | "stock_quantity" | "minimum_stock" | "stock_status">[];
}

export type ReportType = "sales" | "purchases" | "inventory" | "customers" | "suppliers" | "expenses" | "payments" | "profit-loss";

export interface ReportResult {
  type: ReportType;
  title: string;
  columns: { key: string; label: string; type?: "text" | "money" | "number" | "date" | "status" }[];
  rows: (Record<string, unknown> & { id: number | string })[];
  total: number;
  page: number;
  pageSize: number;
  paginated: boolean;
  summary: { label: string; value: number; type: "money" | "number" | "percent" }[];
}

// Workforce ------------------------------------------------------------------
export interface Department {
  id: number;
  name: string;
  code: string;
  head: string | null;
  color: string;
  detail: string | null;
  employee_count: number;
}

export interface Employee {
  id: number;
  employee_code: string;
  name: string;
  department_id: number | null;
  department_name: string | null;
  role: string;
  working_hours: string;
  status: "Active" | "On leave" | "Offline";
  email: string | null;
  phone: string | null;
  color: string;
  joining_date: string;
}

export interface Operation {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_color: string;
  department_name: string | null;
  work: string;
  entry_date: string;
  start_time: string;
  end_time: string;
  status: "Pending" | "In Progress" | "Completed" | "Cancelled";
  description: string | null;
}

export interface AttendanceRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_color: string;
  department_name: string | null;
  working_hours: string;
  attendance_date: string;
  status: "Present" | "Absent" | "Late" | "Leave" | "Half Day";
  check_in: string | null;
}

export interface Task {
  id: number;
  title: string;
  employee_id: number | null;
  employee_name: string | null;
  department_id: number | null;
  department_name: string | null;
  due_date: string | null;
  priority: "Low" | "Medium" | "High";
  status: "Pending" | "In Progress" | "Completed";
  description: string | null;
}
