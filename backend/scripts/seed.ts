/**
 * Development/demo seed data.
 *
 *   npm run seed          # only runs on an empty database
 *   npm run seed:reset    # wipes ERP data (not user accounts) and seeds again
 *
 * Everything is created through the same services the API uses, so stock,
 * balances, payments and P&L come from real transactions — nothing is typed in.
 * Refuses to run when NODE_ENV=production unless --force is passed.
 */
import { env } from "../src/config/env.js";
import { ROLE_PERMISSIONS, type Role } from "../src/config/permissions.js";
import { supabase } from "../src/config/supabase.js";
import type { AuthUser } from "../src/middleware/auth.js";
import { parse } from "../src/middleware/validate.js";
import { createExpense, createPayment } from "../src/services/finance.service.js";
import * as hr from "../src/services/hr.service.js";
import { createAdjustment, createCategory, createProduct } from "../src/services/inventory.service.js";
import { createCustomer, createSupplier } from "../src/services/parties.service.js";
import { cancelSale, createSale } from "../src/services/sales.service.js";
import { createPurchase } from "../src/services/purchases.service.js";
import { createPurchaseReturn, createSalesReturn } from "../src/services/returns.service.js";
import { createUser } from "../src/services/users.service.js";
import { addDays, today } from "../src/utils/dates.js";
import * as v from "../src/validators/erp.js";

const args = new Set(process.argv.slice(2));
const PASSWORD = process.env.SEED_PASSWORD ?? "Northstar#2026";

// Children before parents.
const ERP_TABLES = [
  "payment_allocations", "payments", "sales_return_items", "sales_returns", "purchase_return_items",
  "purchase_returns", "sale_items", "sales", "purchase_items", "purchases", "stock_movements",
  "stock_adjustments", "expenses", "products", "categories", "customers", "suppliers",
  "tasks", "attendance", "operations", "employees", "departments",
];

const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: "admin@northstar.test", name: "Ayesha Yousaf", role: "admin" },
  { email: "manager@northstar.test", name: "Bilal Hussain", role: "manager" },
  { email: "sales@northstar.test", name: "Omar Farooq", role: "sales_staff" },
  { email: "inventory@northstar.test", name: "Sara Ali", role: "inventory_staff" },
];

const day = (daysAgo: number) => addDays(today(), -daysAgo);

async function resetErpData() {
  for (const table of ERP_TABLES) {
    const { error } = await supabase.from(table).delete().gte("id", 0);
    if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
  }
  console.log("✓ cleared ERP data (user accounts kept)");
}

async function ensureUser(user: (typeof DEMO_USERS)[number]) {
  const existing = await supabase.from("users").select("id").eq("email", user.email).maybeSingle();
  if (existing.data) {
    await supabase.from("users").update({ name: user.name, role: user.role, is_active: true }).eq("id", existing.data.id);
    await supabase.auth.admin.updateUserById(existing.data.id, { password: PASSWORD, app_metadata: { role: user.role }, ban_duration: "none" });
    return existing.data.id as string;
  }
  const created = await createUser({ ...user, password: PASSWORD });
  return created.id as string;
}

async function main() {
  if (env.isProduction && !args.has("--force")) {
    console.error("Refusing to seed demo data into a production environment (pass --force to override).");
    process.exit(1);
  }
  if (args.has("--reset")) await resetErpData();

  const { count } = await supabase.from("products").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    console.error("The database already has products. Run `npm run seed:reset` to wipe ERP data and seed again.");
    process.exit(1);
  }

  const ids: Record<string, string> = {};
  for (const user of DEMO_USERS) ids[user.role] = await ensureUser(user);
  console.log(`✓ demo users ready (password: ${PASSWORD})`);
  const admin: AuthUser = { id: ids.admin, email: DEMO_USERS[0].email, name: DEMO_USERS[0].name, role: "admin", permissions: ROLE_PERMISSIONS.admin };

  // Workforce (carried over from the original app) --------------------------
  const departments: Record<string, number> = {};
  for (const d of [
    { name: "Laboratory", code: "LAB", head: "Ahmed Khan", color: "#c9c0ff", detail: "Testing, analysis & quality" },
    { name: "Research", code: "R&D", head: "Sara Ali", color: "#bfe2b6", detail: "Insights & development" },
    { name: "Administration", code: "ADM", head: "Bilal Hussain", color: "#f0d29b", detail: "Office operations" },
    { name: "Accounts", code: "ACC", head: "Nadia Raza", color: "#e9b9b5", detail: "Finance & reporting" },
    { name: "Sales", code: "SAL", head: "Omar Farooq", color: "#b9c9d8", detail: "Client relationships" },
  ]) {
    const row = await hr.departments.create(parse(v.departmentSchema, d));
    departments[d.name] = row.id;
  }

  const employees: Record<string, number> = {};
  for (const e of [
    { name: "Ahmed Khan", employee_code: "EMP-024", department: "Laboratory", role: "Lab Technician", status: "Active", color: "#d7b9a6", email: "ahmed.khan@northstar.test", phone: "+92 300 123 4521" },
    { name: "Sara Ali", employee_code: "EMP-018", department: "Research", role: "Research Associate", working_hours: "10:00 – 18:00", status: "Active", color: "#c4bced", email: "sara.ali@northstar.test", phone: "+92 301 884 2310" },
    { name: "Bilal Hussain", employee_code: "EMP-031", department: "Administration", role: "Office Manager", working_hours: "08:30 – 16:30", status: "Active", color: "#bad2b4", email: "bilal.h@northstar.test", phone: "+92 303 442 1059" },
    { name: "Nadia Raza", employee_code: "EMP-009", department: "Accounts", role: "Accounts Officer", status: "On leave", color: "#e4c494", email: "nadia.raza@northstar.test", phone: "+92 311 762 4892" },
    { name: "Omar Farooq", employee_code: "EMP-042", department: "Sales", role: "Account Executive", working_hours: "09:30 – 17:30", status: "Active", color: "#b9c6d2", email: "omar.farooq@northstar.test", phone: "+92 335 762 4992" },
    { name: "Maryam Saeed", employee_code: "EMP-014", department: "Laboratory", role: "Quality Analyst", status: "Offline", color: "#d5b9c9", email: "maryam.s@northstar.test", phone: "+92 312 821 3434" },
  ]) {
    const row = await hr.createEmployee(parse(v.employeeSchema, { ...e, department_id: departments[e.department], joining_date: day(400) }));
    employees[e.name] = row.id;
  }

  for (const o of [
    { employee: "Ahmed Khan", work: "Sample Analysis", start: "09:00", end: "11:30", status: "Completed", days: 0, description: "Processed the morning batch and uploaded test results for review." },
    { employee: "Sara Ali", work: "Report Preparation", start: "11:00", end: "13:00", status: "In Progress", days: 0, description: "Preparing the comparative report for the Q3 research review." },
    { employee: "Bilal Hussain", work: "Vendor Follow-up", start: "13:30", end: "14:15", status: "Pending", days: 0, description: "Confirming delivery windows with the three approved vendors." },
    { employee: "Omar Farooq", work: "Client Check-in", start: "15:00", end: "16:00", status: "Completed", days: 1, description: "Walkthrough of the new service package with a key account." },
    { employee: "Maryam Saeed", work: "Calibration Review", start: "10:00", end: "12:00", status: "Cancelled", days: 1, description: "Moved to next week's calibration block due to equipment maintenance." },
  ]) {
    await hr.operations.create(parse(v.operationSchema, {
      employee_id: employees[o.employee], work: o.work, entry_date: day(o.days), start_time: o.start, end_time: o.end, status: o.status, description: o.description,
    }));
  }

  for (const t of [
    { title: "Approve sample batch results", employee: "Ahmed Khan", department: "Laboratory", due: 0, priority: "High", status: "In Progress" },
    { title: "Finalize Q3 research report", employee: "Sara Ali", department: "Research", due: -1, priority: "High", status: "In Progress" },
    { title: "Update vendor register", employee: "Bilal Hussain", department: "Administration", due: -3, priority: "Medium", status: "Pending" },
    { title: "Send renewal summary", employee: "Omar Farooq", department: "Sales", due: 1, priority: "Low", status: "Completed" },
  ]) {
    await hr.tasks.create(parse(v.taskSchema, {
      title: t.title, employee_id: employees[t.employee], department_id: departments[t.department], due_date: day(t.due), priority: t.priority, status: t.status,
    }));
  }

  const attendance: [string, string, string | null][] = [
    ["Ahmed Khan", "Present", "08:57"], ["Sara Ali", "Late", "10:14"], ["Bilal Hussain", "Present", "08:45"],
    ["Nadia Raza", "Leave", null], ["Omar Farooq", "Present", "09:28"],
  ];
  for (let back = 0; back < 5; back++) {
    for (const [name, status, checkIn] of attendance) {
      await hr.attendance.create(parse(v.attendanceSchema, {
        employee_id: employees[name], attendance_date: day(back), status: back === 0 ? status : name === "Nadia Raza" ? "Leave" : "Present", check_in: checkIn,
      }));
    }
  }
  console.log("✓ departments, employees, operations, tasks, attendance");

  // Catalogue & parties -------------------------------------------------------
  const categories: Record<string, number> = {};
  for (const [name, description] of [
    ["Lab consumables", "Gloves, tips, tubes and other single-use items"],
    ["Glassware", "Slides, dishes and reusable glass"],
    ["Chemicals", "Reagents and cleaning solutions"],
    ["Office supplies", "Paper, printing and stationery"],
  ]) {
    categories[name] = (await createCategory(parse(v.categorySchema, { name, description }))).id;
  }

  const suppliers: Record<string, number> = {};
  for (const s of [
    { name: "Karachi Scientific Traders", phone: "+92 21 3456 7890", email: "orders@kst.test", address: "Saddar, Karachi" },
    { name: "Lahore Lab Supplies", phone: "+92 42 3578 1122", email: "sales@lls.test", address: "Gulberg III, Lahore" },
    { name: "Capital Office Mart", phone: "+92 51 2873 4410", email: "hello@com.test", address: "Blue Area, Islamabad" },
  ]) {
    suppliers[s.name] = (await createSupplier(parse(v.partySchema, s))).id;
  }

  const customers: Record<string, number> = {};
  for (const c of [
    { name: "Aga Diagnostics", phone: "+92 21 111 911 911", email: "procurement@agadx.test", address: "Clifton, Karachi" },
    { name: "Shifa Research Centre", phone: "+92 51 846 4646", email: "stores@shifa.test", address: "H-8/4, Islamabad" },
    { name: "Punjab Pathology Labs", phone: "+92 42 3587 0000", email: "accounts@ppl.test", address: "Model Town, Lahore" },
    { name: "Indus Biotech", phone: "+92 22 278 1234", email: "buy@indusbio.test", address: "Latifabad, Hyderabad" },
    { name: "Green Valley Clinic", phone: "+92 91 525 8800", email: "admin@gvc.test", address: "University Town, Peshawar" },
  ]) {
    customers[c.name] = (await createCustomer(parse(v.partySchema, c))).id;
  }

  const products: Record<string, number> = {};
  for (const p of [
    { sku: "GLV-NTR-100", name: "Nitrile gloves (box of 100)", category: "Lab consumables", supplier: "Karachi Scientific Traders", unit: "box", sell: 1450, min: 20, opening: 0 },
    { sku: "TIP-200-1K", name: "Pipette tips 200µl (pack of 1000)", category: "Lab consumables", supplier: "Lahore Lab Supplies", unit: "pack", sell: 2600, min: 10, opening: 0 },
    { sku: "TUB-CEN-50", name: "Centrifuge tubes 50ml (pack of 25)", category: "Lab consumables", supplier: "Lahore Lab Supplies", unit: "pack", sell: 1900, min: 8, opening: 0 },
    { sku: "SLD-MIC-72", name: "Microscope slides (box of 72)", category: "Glassware", supplier: "Karachi Scientific Traders", unit: "box", sell: 950, min: 10, opening: 0 },
    { sku: "DSH-PET-10", name: "Petri dishes 90mm (sleeve of 10)", category: "Glassware", supplier: "Karachi Scientific Traders", unit: "sleeve", sell: 780, min: 15, opening: 0 },
    { sku: "ETH-70-1L", name: "Ethanol 70% solution", category: "Chemicals", supplier: "Lahore Lab Supplies", unit: "litre", sell: 1150, min: 12, opening: 0 },
    { sku: "PPR-A4-500", name: "A4 copier paper (500 sheets)", category: "Office supplies", supplier: "Capital Office Mart", unit: "ream", sell: 1650, min: 10, opening: 0 },
    { sku: "COT-LAB-M", name: "Lab coat, medium", category: "Lab consumables", supplier: "Capital Office Mart", unit: "pcs", sell: 3200, min: 5, opening: 4 },
  ]) {
    const created = await createProduct(parse(v.productCreateSchema, {
      sku: p.sku, name: p.name, category_id: categories[p.category], supplier_id: suppliers[p.supplier], unit: p.unit,
      purchase_price: p.opening ? 2100 : 0, selling_price: p.sell, minimum_stock: p.min, stock_quantity: p.opening,
    }), admin);
    products[p.sku] = created.id;
  }
  console.log("✓ categories, suppliers, customers, products");

  // Purchases (stock in, supplier payables) ------------------------------------
  const purchase = async (supplier: string, daysAgo: number, invoice: string, items: [string, number, number][], paid: number, extra: Record<string, unknown> = {}) =>
    createPurchase(parse(v.purchaseCreateSchema, {
      supplier_id: suppliers[supplier], purchase_date: day(daysAgo), invoice_number: invoice, payment_method: "bank", paid_amount: paid,
      items: items.map(([sku, quantity, price]) => ({ product_id: products[sku], quantity, purchase_price: price })), ...extra,
    }), admin);

  const p1 = await purchase("Karachi Scientific Traders", 40, "KST-8812", [["GLV-NTR-100", 60, 980], ["SLD-MIC-72", 40, 610], ["DSH-PET-10", 50, 480]], 60000, { discount: 1300 });
  await purchase("Lahore Lab Supplies", 33, "LLS-2231", [["TIP-200-1K", 30, 1750], ["TUB-CEN-50", 25, 1260], ["ETH-70-1L", 40, 720]], 0, { tax_rate: 5 });
  await purchase("Capital Office Mart", 21, "COM-0457", [["PPR-A4-500", 30, 1180]], 35400);
  await purchase("Karachi Scientific Traders", 6, "KST-8930", [["GLV-NTR-100", 30, 1010]], 10000);
  console.log("✓ purchases");

  // Sales (stock out, customer receivables) ------------------------------------
  const sale = async (customer: string | null, daysAgo: number, items: [string, number, number?][], paid: number | "full", extra: Record<string, unknown> = {}) => {
    const lines = items.map(([sku, quantity, discount]) => ({ product_id: products[sku], quantity, selling_price: 0, discount: discount ?? 0 }));
    const { data } = await supabase.from("products").select("id, selling_price").in("id", lines.map(l => l.product_id));
    for (const line of lines) line.selling_price = Number(data!.find(row => row.id === line.product_id)!.selling_price);
    const input = parse(v.saleCreateSchema, {
      customer_id: customer ? customers[customer] : null, sale_date: day(daysAgo), payment_method: "cash", items: lines, paid_amount: 0, ...extra,
    });
    if (paid === "full") {
      const { priceInvoice } = await import("../src/services/calculations.js");
      input.paid_amount = priceInvoice({ lines: input.items.map(i => ({ quantity: i.quantity, price: i.selling_price, discount: i.discount })), discount: input.discount, tax: input.tax, taxRate: input.tax_rate, paid: 0 }).total;
    } else {
      input.paid_amount = paid;
    }
    return createSale(input, admin);
  };

  const s1 = await sale("Aga Diagnostics", 35, [["GLV-NTR-100", 20], ["SLD-MIC-72", 10]], 20000, { tax_rate: 5 });
  await sale("Shifa Research Centre", 28, [["TIP-200-1K", 8], ["TUB-CEN-50", 6, 400]], "full", { payment_method: "bank" });
  const s3 = await sale("Punjab Pathology Labs", 18, [["ETH-70-1L", 15], ["DSH-PET-10", 20]], 0, { discount: 500 });
  await sale(null, 12, [["PPR-A4-500", 6], ["COT-LAB-M", 1]], "full");
  await sale("Indus Biotech", 7, [["GLV-NTR-100", 25], ["TIP-200-1K", 6]], 30000, { tax_rate: 5, payment_method: "online_transfer" });
  await sale("Aga Diagnostics", 2, [["TUB-CEN-50", 10], ["SLD-MIC-72", 12]], 10000);
  await sale(null, 0, [["PPR-A4-500", 3], ["DSH-PET-10", 4]], "full", { payment_method: "card" });
  const cancelled = await sale("Green Valley Clinic", 1, [["COT-LAB-M", 2]], 0);
  await cancelSale(cancelled.id, {}, admin);
  console.log("✓ sales (including one cancelled)");

  // Payments -------------------------------------------------------------------
  await createPayment(parse(v.paymentSchema, { party_type: "customer", customer_id: customers["Aga Diagnostics"], amount: 12000, payment_method: "bank", payment_date: day(20), reference: "HBL-44120" }), admin);
  await createPayment(parse(v.paymentSchema, { party_type: "customer", customer_id: customers["Punjab Pathology Labs"], invoice_id: s3.id, amount: 15000, payment_method: "online_transfer", payment_date: day(9), reference: "IBFT-99812" }), admin);
  await createPayment(parse(v.paymentSchema, { party_type: "supplier", supplier_id: suppliers["Lahore Lab Supplies"], amount: 50000, payment_method: "bank", payment_date: day(15), reference: "CHQ-100245" }), admin);
  await createPayment(parse(v.paymentSchema, { party_type: "supplier", supplier_id: suppliers["Karachi Scientific Traders"], amount: 20000, payment_method: "cash", payment_date: day(4) }), admin);
  console.log("✓ customer & supplier payments");

  // Returns & adjustments ----------------------------------------------------------
  await createSalesReturn(parse(v.salesReturnSchema, {
    sale_id: s1.id, return_date: day(30), reason: "Two boxes arrived with torn packaging",
    items: [{ sale_item_id: s1.items.find((i: { product_id: number }) => i.product_id === products["GLV-NTR-100"]).id, quantity: 2 }],
  }), admin);
  await createPurchaseReturn(parse(v.purchaseReturnSchema, {
    purchase_id: p1.id, return_date: day(38), reason: "Chipped slides in one carton", refund_method: "bank",
    items: [{ purchase_item_id: p1.items.find((i: { product_id: number }) => i.product_id === products["SLD-MIC-72"]).id, quantity: 4 }],
  }), admin);
  await createAdjustment(parse(v.stockAdjustmentSchema, { product_id: products["ETH-70-1L"], adjustment_type: "decrease", quantity: 2, reason: "Evaporation loss found in monthly count" }), admin);
  console.log("✓ returns & stock adjustment");

  // Expenses ------------------------------------------------------------------------
  for (const e of [
    { title: "Office & lab rent", category: "rent", amount: 85000, payment_method: "bank", days: 30 },
    { title: "Electricity bill", category: "electricity", amount: 23800, payment_method: "bank", days: 24 },
    { title: "Fibre internet", category: "internet", amount: 6500, payment_method: "online_transfer", days: 22 },
    { title: "Staff salaries", category: "salaries", amount: 210000, payment_method: "bank", days: 14 },
    { title: "Courier & deliveries", category: "transport", amount: 7200, payment_method: "cash", days: 9 },
    { title: "Fume hood servicing", category: "maintenance", amount: 12500, payment_method: "cash", days: 5 },
    { title: "Trade show booth", category: "marketing", amount: 18000, payment_method: "card", days: 3 },
  ]) {
    await createExpense(parse(v.expenseSchema, { ...e, expense_date: day(e.days) }), admin);
  }
  console.log("✓ expenses");

  const check = await supabase.rpc("erp_integrity_check");
  const problems = Object.entries(check.data ?? {}).filter(([, rows]) => (rows as unknown[]).length);
  if (check.error || problems.length) {
    console.error("Integrity check failed:", check.error ?? problems);
    process.exit(1);
  }
  console.log("✓ integrity check passed — seed complete");
  console.log("\nDemo logins:");
  for (const user of DEMO_USERS) console.log(`  ${user.role.padEnd(16)} ${user.email}  /  ${PASSWORD}`);
}

main().catch(error => {
  console.error("Seed failed:", error instanceof Error ? `${error.message}${"details" in error ? ` ${JSON.stringify((error as { details?: unknown }).details)}` : ""}` : error);
  process.exit(1);
});
