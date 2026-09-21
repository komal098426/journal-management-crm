import type { z } from "zod";
import type { AuthUser } from "../middleware/auth.js";
import { can } from "../config/permissions.js";
import { rpc } from "../utils/db.js";
import { badRequest, conflict, forbidden } from "../utils/errors.js";
import { num, toCents } from "../utils/money.js";
import type { ListQuery } from "../utils/query.js";
import type { expenseSchema, paymentSchema } from "../validators/erp.js";
import { crud, getRow, listRows } from "./resource.js";

type ExpenseInput = z.infer<typeof expenseSchema>;
type PaymentInput = z.infer<typeof paymentSchema>;

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
const expenses = crud({
  table: "expenses",
  label: "Expense",
  sortable: ["expense_date", "amount", "title", "category", "created_at"],
  defaultSort: "expense_date",
  searchColumns: ["title", "description"],
  dateColumn: "expense_date",
});

export const listExpenses = (query: ListQuery, filters: { category?: string; payment_method?: string }) =>
  expenses.list(query, q => {
    if (filters.category) q = q.eq("category", filters.category);
    if (filters.payment_method) q = q.eq("payment_method", filters.payment_method);
    return q;
  });

export const getExpense = expenses.get;
export const deleteExpense = expenses.remove;

export async function createExpense(input: ExpenseInput, user: AuthUser) {
  const id = await rpc<number>("erp_create_expense", { p: input, p_user: user.id });
  return getExpense(Number(id));
}

export async function updateExpense(id: number, input: ExpenseInput) {
  await rpc("erp_update_expense", { p_id: id, p: input });
  return getExpense(id);
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export type PartyType = "customer" | "supplier" | "expense";

/** Which payment ledgers a user may see, derived from their module permissions. */
export function visiblePartyTypes(user: AuthUser): PartyType[] {
  const types: PartyType[] = [];
  if (can(user.role, "sales:read") || can(user.role, "finance:read")) types.push("customer");
  if (can(user.role, "purchases:read") || can(user.role, "finance:read")) types.push("supplier");
  if (can(user.role, "expenses:read") || can(user.role, "finance:read")) types.push("expense");
  return types;
}

export function listPayments(
  query: ListQuery,
  user: AuthUser,
  filters: { party_type?: PartyType; customer_id?: number | null; supplier_id?: number | null; direction?: "in" | "out"; payment_method?: string },
) {
  const allowed = visiblePartyTypes(user);
  if (filters.party_type && !allowed.includes(filters.party_type)) throw forbidden("You cannot view these payments");
  return listRows({
    source: "v_payments",
    query,
    sortable: ["payment_date", "amount", "party_name", "created_at"],
    defaultSort: "payment_date",
    searchColumns: ["party_name", "reference", "notes"],
    dateColumn: "payment_date",
    apply: q => {
      q = filters.party_type ? q.eq("party_type", filters.party_type) : q.in("party_type", allowed);
      if (filters.customer_id) q = q.eq("customer_id", filters.customer_id);
      if (filters.supplier_id) q = q.eq("supplier_id", filters.supplier_id);
      if (filters.direction) q = q.eq("direction", filters.direction);
      if (filters.payment_method) q = q.eq("payment_method", filters.payment_method);
      return q;
    },
  });
}

export async function createPayment(input: PaymentInput, user: AuthUser) {
  const permission = input.party_type === "customer" ? "sales:write" : "purchases:write";
  if (!can(user.role, permission)) throw forbidden(`You cannot record ${input.party_type} payments`);

  const party = input.party_type === "customer"
    ? await getRow("customers", input.customer_id!, "Customer")
    : await getRow("suppliers", input.supplier_id!, "Supplier");
  const balance = num(party.balance);
  if (toCents(balance) <= 0) throw conflict(`${party.name} has no outstanding balance`);
  if (toCents(input.amount) > toCents(balance)) {
    throw badRequest(`Payment exceeds the outstanding balance of ${balance.toFixed(2)}`);
  }

  const id = await rpc<number>("erp_record_party_payment", {
    p: {
      party_type: input.party_type,
      customer_id: input.party_type === "customer" ? input.customer_id : null,
      supplier_id: input.party_type === "supplier" ? input.supplier_id : null,
      invoice_id: input.invoice_id ?? null,
      amount: input.amount,
      payment_method: input.payment_method,
      reference: input.reference,
      notes: input.notes,
      payment_date: input.payment_date,
    },
    p_user: user.id,
  });
  return getRow("v_payments", Number(id), "Payment");
}
