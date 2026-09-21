import { badRequest } from "../utils/errors.js";
import { allocateCents, fromCents, round3, toCents } from "../utils/money.js";

// ---------------------------------------------------------------------------
// Invoice pricing (sales & purchases)
// ---------------------------------------------------------------------------
export type LineInput = { quantity: number; price: number; discount: number };
export type PricedLine = LineInput & { subtotal: number; netCents: number };

export type InvoiceInput = {
  lines: LineInput[];
  discount: number;
  tax?: number;
  taxRate?: number;
  paid: number;
};

export type PricedInvoice = {
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  remaining: number;
};

/**
 * subtotal  = Σ (quantity × price − line discount)
 * total     = subtotal − order discount + tax
 * tax       = explicit amount, or tax_rate% of (subtotal − discount)
 */
export function priceInvoice(input: InvoiceInput, options: { enforcePaid?: boolean } = {}): PricedInvoice {
  const lines = input.lines.map((line, index) => {
    const grossCents = toCents(line.quantity * line.price);
    const discountCents = toCents(line.discount);
    if (discountCents > grossCents) {
      throw badRequest(`Line ${index + 1}: discount cannot exceed the line amount`);
    }
    return { ...line, quantity: round3(line.quantity), subtotal: fromCents(grossCents - discountCents), netCents: grossCents - discountCents };
  });

  const subtotalCents = lines.reduce((sum, line) => sum + line.netCents, 0);
  const discountCents = toCents(input.discount);
  if (discountCents > subtotalCents) throw badRequest("Invoice discount cannot exceed the subtotal");

  const taxableCents = subtotalCents - discountCents;
  const taxCents = input.taxRate !== undefined && input.tax === undefined
    ? Math.round((taxableCents * input.taxRate) / 100)
    : toCents(input.tax ?? 0);
  const totalCents = taxableCents + taxCents;
  const paidCents = toCents(input.paid);

  if (options.enforcePaid !== false && paidCents > totalCents) {
    throw badRequest("Paid amount cannot be more than the invoice total");
  }

  return {
    lines,
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discountCents),
    tax: fromCents(taxCents),
    total: fromCents(totalCents),
    paid: fromCents(paidCents),
    remaining: fromCents(totalCents - paidCents),
  };
}

/**
 * Effective unit cost of each purchase line after spreading the order-level
 * discount by line value. Tax is excluded (treated as recoverable).
 */
export function unitCosts(invoice: PricedInvoice): number[] {
  const discountShares = allocateCents(toCents(invoice.discount), invoice.lines.map(line => line.netCents));
  return invoice.lines.map((line, index) => {
    const netCents = line.netCents - discountShares[index];
    return Math.round((netCents / 100 / line.quantity) * 10_000) / 10_000;
  });
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------
export type ReturnableLine = {
  id: number;
  quantity: number;
  returned_quantity: number;
  subtotal: number;
};

export type ReturnInvoice = {
  total: number;
  tax: number;
  returned_amount: number;
  returned_tax: number;
  lines: ReturnableLine[];
};

export type ReturnRequest = { lineId: number; quantity: number }[];

/**
 * Values a return at what the customer (or we) actually paid per unit: each
 * line's share of the invoice total, including its share of the order
 * discount and tax. When the return empties the invoice, the amount is set to
 * exactly what is left so rounding never leaves stray cents.
 */
export function valueReturn(invoice: ReturnInvoice, request: ReturnRequest) {
  const weights = invoice.lines.map(line => toCents(line.subtotal));
  const totalShares = allocateCents(toCents(invoice.total), weights);
  const taxShares = allocateCents(toCents(invoice.tax), weights);

  const seen = new Set<number>();
  const items = request.map(entry => {
    if (seen.has(entry.lineId)) throw badRequest("Each item can only appear once in a return");
    seen.add(entry.lineId);
    const index = invoice.lines.findIndex(line => line.id === entry.lineId);
    if (index === -1) throw badRequest("A returned item does not belong to this invoice");
    const line = invoice.lines[index];
    const open = round3(line.quantity - line.returned_quantity);
    if (entry.quantity > open + 1e-9) {
      throw badRequest(`Only ${open} unit(s) of line ${index + 1} can still be returned`);
    }
    const ratio = entry.quantity / line.quantity;
    return {
      lineId: line.id,
      quantity: round3(entry.quantity),
      amountCents: Math.round(totalShares[index] * ratio),
      taxCents: Math.round(taxShares[index] * ratio),
      emptiesLine: Math.abs(entry.quantity - open) < 1e-9,
    };
  });

  const remainingValueCents = toCents(invoice.total) - toCents(invoice.returned_amount);
  const remainingTaxCents = toCents(invoice.tax) - toCents(invoice.returned_tax);
  const emptiesInvoice = invoice.lines.every(line => {
    const item = items.find(entry => entry.lineId === line.id);
    return item ? item.emptiesLine : line.returned_quantity >= line.quantity;
  });

  let amountCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  let taxCents = items.reduce((sum, item) => sum + item.taxCents, 0);

  if (emptiesInvoice) {
    // Put the rounding difference on the last line.
    const last = items[items.length - 1];
    last.amountCents += remainingValueCents - amountCents;
    last.taxCents += Math.max(0, remainingTaxCents) - taxCents;
    amountCents = remainingValueCents;
    taxCents = Math.max(0, remainingTaxCents);
  } else {
    amountCents = Math.min(amountCents, remainingValueCents);
    taxCents = Math.min(taxCents, Math.max(0, remainingTaxCents), amountCents);
  }

  if (amountCents <= 0 && items.every(item => item.amountCents <= 0) && remainingValueCents > 0) {
    // Zero-value lines (free items) are still returnable; amounts stay zero.
  }

  return {
    items: items.map(item => ({ lineId: item.lineId, quantity: item.quantity, amount: fromCents(Math.max(0, item.amountCents)) })),
    total: fromCents(amountCents),
    tax: fromCents(taxCents),
  };
}

// ---------------------------------------------------------------------------
// Profit & loss
// ---------------------------------------------------------------------------
export type FinancialTotals = {
  sales_count: number;
  sales_total: number;
  sales_tax: number;
  sales_discount: number;
  sales_cost: number;
  sales_returns_count: number;
  sales_returns_total: number;
  sales_returns_tax: number;
  sales_returns_cost: number;
  purchases_count: number;
  purchases_total: number;
  purchase_returns_total: number;
  expenses_count: number;
  expenses_total: number;
  expenses_by_category: Record<string, number>;
  cash_in: number;
  cash_out: number;
};

/**
 * Revenue       = sales (excl. tax) − sales returns (excl. tax)
 * COGS          = cost of units sold − cost of units returned
 * Gross profit  = Revenue − COGS
 * Net profit    = Gross profit − operating expenses
 */
export function profitAndLoss(raw: Record<string, unknown>) {
  const t = normaliseTotals(raw);
  const grossSalesCents = toCents(t.sales_total) - toCents(t.sales_tax);
  const returnsCents = toCents(t.sales_returns_total) - toCents(t.sales_returns_tax);
  const revenueCents = grossSalesCents - returnsCents;
  const cogsCents = toCents(t.sales_cost) - toCents(t.sales_returns_cost);
  const grossProfitCents = revenueCents - cogsCents;
  const expensesCents = toCents(t.expenses_total);
  const netProfitCents = grossProfitCents - expensesCents;

  return {
    totals: t,
    grossSales: fromCents(grossSalesCents),
    salesReturns: fromCents(returnsCents),
    revenue: fromCents(revenueCents),
    costOfGoodsSold: fromCents(cogsCents),
    grossProfit: fromCents(grossProfitCents),
    operatingExpenses: fromCents(expensesCents),
    netProfit: fromCents(netProfitCents),
    grossMargin: revenueCents > 0 ? Math.round((grossProfitCents / revenueCents) * 1000) / 10 : 0,
    netMargin: revenueCents > 0 ? Math.round((netProfitCents / revenueCents) * 1000) / 10 : 0,
    netPurchases: fromCents(toCents(t.purchases_total) - toCents(t.purchase_returns_total)),
  };
}

function normaliseTotals(raw: Record<string, unknown>): FinancialTotals {
  const numberKeys: (keyof FinancialTotals)[] = [
    "sales_count", "sales_total", "sales_tax", "sales_discount", "sales_cost", "sales_returns_count",
    "sales_returns_total", "sales_returns_tax", "sales_returns_cost", "purchases_count", "purchases_total",
    "purchase_returns_total", "expenses_count", "expenses_total", "cash_in", "cash_out",
  ];
  const result = {} as FinancialTotals;
  for (const key of numberKeys) (result as Record<string, unknown>)[key] = Number(raw[key] ?? 0);
  const categories = (raw.expenses_by_category ?? {}) as Record<string, unknown>;
  result.expenses_by_category = Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, Number(value)]));
  return result;
}
