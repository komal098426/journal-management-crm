import { z } from "zod";
import { ROLES } from "../config/permissions.js";
import {
  id, isoDate, money, optionalEmail, optionalId, optionalText, paymentMethod, positiveMoney,
  quantity, requiredText, text, time,
} from "./common.js";

// ---------------------------------------------------------------------------
// Parties & inventory
// ---------------------------------------------------------------------------
export const partySchema = z.object({
  name: requiredText("Name", 120),
  phone: optionalText(40),
  email: optionalEmail,
  address: optionalText(300),
});

export const categorySchema = z.object({
  name: requiredText("Category name", 80),
  description: optionalText(300),
});

const productBase = {
  name: requiredText("Product name", 160),
  sku: requiredText("SKU", 60).regex(/^[A-Za-z0-9._\-/]+$/, "SKU can contain letters, numbers, . _ - and /").transform(value => value.toUpperCase()),
  category_id: optionalId,
  brand: optionalText(80),
  unit: text(20).default("pcs").transform(value => value || "pcs"),
  purchase_price: money,
  selling_price: money,
  minimum_stock: money.default(0),
  supplier_id: optionalId,
  image: z.preprocess(value => value ?? "", z.union([z.literal(""), z.url("Image must be a valid URL")])).transform(value => value || null),
  description: optionalText(1000),
  status: z.enum(["active", "inactive"]).default("active"),
};

export const productCreateSchema = z.object({ ...productBase, stock_quantity: money.default(0) });
export const productUpdateSchema = z.object(productBase).partial().extend({
  stock_quantity: z.never({ message: "Stock can only change through purchases, sales, returns or adjustments" }).optional(),
});

export const stockAdjustmentSchema = z.object({
  product_id: id,
  adjustment_type: z.enum(["increase", "decrease"], { message: "Choose increase or decrease" }),
  quantity,
  reason: requiredText("Reason", 300),
});

// ---------------------------------------------------------------------------
// Sales & purchases
// ---------------------------------------------------------------------------
const invoiceTotals = {
  discount: money.default(0),
  tax: money.optional(),
  tax_rate: z.coerce.number().min(0, "Tax rate cannot be negative").max(100, "Tax rate cannot exceed 100%").optional(),
  payment_method: paymentMethod,
  notes: optionalText(1000),
};

const saleItem = z.object({
  product_id: id,
  quantity,
  selling_price: money,
  discount: money.default(0),
});

export const saleCreateSchema = z.object({
  customer_id: optionalId,
  sale_date: isoDate,
  items: z.array(saleItem).min(1, "Add at least one product").max(200, "A sale can have at most 200 lines"),
  paid_amount: money.default(0),
  ...invoiceTotals,
});

export const saleUpdateSchema = saleCreateSchema.omit({ paid_amount: true }).extend({
  additional_payment: money.default(0),
});

const purchaseItem = z.object({
  product_id: id,
  quantity,
  purchase_price: money,
  discount: money.default(0),
});

export const purchaseCreateSchema = z.object({
  supplier_id: id,
  invoice_number: optionalText(60),
  purchase_date: isoDate,
  items: z.array(purchaseItem).min(1, "Add at least one product").max(200, "A purchase can have at most 200 lines"),
  paid_amount: money.default(0),
  ...invoiceTotals,
});

export const purchaseUpdateSchema = purchaseCreateSchema.omit({ paid_amount: true }).extend({
  additional_payment: money.default(0),
});

export const cancelSchema = z.object({
  refund_method: paymentMethod.optional(),
});

// ---------------------------------------------------------------------------
// Returns, payments, expenses
// ---------------------------------------------------------------------------
export const salesReturnSchema = z.object({
  sale_id: id,
  return_date: isoDate,
  reason: optionalText(500),
  refund_method: paymentMethod.optional(),
  items: z.array(z.object({ sale_item_id: id, quantity })).min(1, "Select at least one item to return"),
});

export const purchaseReturnSchema = z.object({
  purchase_id: id,
  return_date: isoDate,
  reason: optionalText(500),
  refund_method: paymentMethod.optional(),
  items: z.array(z.object({ purchase_item_id: id, quantity })).min(1, "Select at least one item to return"),
});

export const paymentSchema = z.object({
  party_type: z.enum(["customer", "supplier"], { message: "Choose customer or supplier" }),
  customer_id: optionalId,
  supplier_id: optionalId,
  invoice_id: optionalId,
  amount: positiveMoney,
  payment_method: paymentMethod,
  reference: optionalText(120),
  notes: optionalText(500),
  payment_date: isoDate,
}).superRefine((value, ctx) => {
  if (value.party_type === "customer" && !value.customer_id) {
    ctx.addIssue({ code: "custom", path: ["customer_id"], message: "Select a customer" });
  }
  if (value.party_type === "supplier" && !value.supplier_id) {
    ctx.addIssue({ code: "custom", path: ["supplier_id"], message: "Select a supplier" });
  }
});

export const EXPENSE_CATEGORIES = ["rent", "electricity", "internet", "salaries", "transport", "maintenance", "marketing", "other"] as const;

export const expenseSchema = z.object({
  title: requiredText("Title", 160),
  category: z.enum(EXPENSE_CATEGORIES, { message: "Choose an expense category" }),
  amount: positiveMoney,
  payment_method: paymentMethod,
  expense_date: isoDate,
  description: optionalText(1000),
  receipt: optionalText(500),
});

// ---------------------------------------------------------------------------
// Workforce modules
// ---------------------------------------------------------------------------
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #c9c0ff");

export const departmentSchema = z.object({
  name: requiredText("Department name", 80),
  code: requiredText("Code", 12).transform(value => value.toUpperCase()),
  head: optionalText(120),
  color: color.default("#c9c0ff"),
  detail: optionalText(200),
});

export const employeeSchema = z.object({
  employee_code: optionalText(32),
  name: requiredText("Full name", 120),
  department_id: optionalId,
  role: text(100).default("Team member").transform(value => value || "Team member"),
  working_hours: text(40).default("09:00 – 17:00").transform(value => value || "09:00 – 17:00"),
  status: z.enum(["Active", "On leave", "Offline"]).default("Active"),
  email: optionalEmail,
  phone: optionalText(40),
  color: color.default("#c9c0ff"),
  joining_date: isoDate.optional(),
});

export const operationSchema = z.object({
  employee_id: id,
  work: requiredText("Work / task", 180),
  entry_date: isoDate,
  start_time: time,
  end_time: time,
  status: z.enum(["Pending", "In Progress", "Completed", "Cancelled"]).default("In Progress"),
  description: optionalText(1000),
}).refine(value => value.end_time > value.start_time, { path: ["end_time"], message: "End time must be after the start time" });

export const attendanceSchema = z.object({
  employee_id: id,
  attendance_date: isoDate,
  status: z.enum(["Present", "Absent", "Late", "Leave", "Half Day"]),
  check_in: z.preprocess(value => (value === "" ? null : value), time.nullable().optional()),
});

export const taskSchema = z.object({
  title: requiredText("Task title", 180),
  employee_id: optionalId,
  department_id: optionalId,
  due_date: z.preprocess(value => (value === "" ? null : value), isoDate.nullable().optional()),
  priority: z.enum(["Low", "Medium", "High"]).default("Medium"),
  status: z.enum(["Pending", "In Progress", "Completed"]).default("Pending"),
  description: optionalText(1000),
});

// ---------------------------------------------------------------------------
// Users & settings
// ---------------------------------------------------------------------------
export const userCreateSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  name: requiredText("Name", 120),
  role: z.enum(ROLES),
});

export const userUpdateSchema = z.object({
  name: requiredText("Name", 120).optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.boolean().optional(),
});

export const settingsSchema = z.object({
  company_name: requiredText("Company name", 120),
  timezone: requiredText("Timezone", 60),
  currency: requiredText("Currency", 3).regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code").transform(value => value.toUpperCase()),
  invoice_footer: text(300),
  low_stock_alerts: z.boolean(),
});

export const rangeQuerySchema = z.object({
  range: z.enum(["today", "week", "month", "year", "custom"]).default("month"),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
