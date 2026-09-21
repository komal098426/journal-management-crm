import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { priceInvoice, profitAndLoss, unitCosts, valueReturn } from "../../src/services/calculations.js";
import { allocateCents } from "../../src/utils/money.js";

describe("priceInvoice", () => {
  it("applies line discounts, invoice discount and tax rate", () => {
    const invoice = priceInvoice({
      lines: [
        { quantity: 3, price: 100, discount: 10 },
        { quantity: 2, price: 50, discount: 0 },
      ],
      discount: 20,
      taxRate: 10,
      paid: 100,
    });
    assert.equal(invoice.subtotal, 390);
    assert.equal(invoice.tax, 37);
    assert.equal(invoice.total, 407);
    assert.equal(invoice.remaining, 307);
    assert.deepEqual(invoice.lines.map(line => line.subtotal), [290, 100]);
  });

  it("uses an explicit tax amount over a rate", () => {
    const invoice = priceInvoice({ lines: [{ quantity: 1, price: 10, discount: 0 }], discount: 0, tax: 1.5, taxRate: 50, paid: 0 });
    assert.equal(invoice.total, 11.5);
  });

  it("avoids floating point drift", () => {
    const invoice = priceInvoice({ lines: [{ quantity: 3, price: 0.1, discount: 0 }, { quantity: 1, price: 0.2, discount: 0 }], discount: 0, paid: 0.5 });
    assert.equal(invoice.total, 0.5);
    assert.equal(invoice.remaining, 0);
  });

  it("rejects invalid discounts and overpayment", () => {
    assert.throws(() => priceInvoice({ lines: [{ quantity: 1, price: 10, discount: 11 }], discount: 0, paid: 0 }), /discount cannot exceed/);
    assert.throws(() => priceInvoice({ lines: [{ quantity: 1, price: 10, discount: 0 }], discount: 11, paid: 0 }), /discount cannot exceed/);
    assert.throws(() => priceInvoice({ lines: [{ quantity: 1, price: 10, discount: 0 }], discount: 0, paid: 11 }), /Paid amount/);
  });
});

describe("unitCosts", () => {
  it("spreads the invoice discount by line value", () => {
    const invoice = priceInvoice({
      lines: [{ quantity: 10, price: 100, discount: 0 }, { quantity: 10, price: 50, discount: 0 }],
      discount: 150,
      paid: 0,
    });
    assert.deepEqual(unitCosts(invoice), [90, 45]);
  });
});

describe("allocateCents", () => {
  it("always sums to the total", () => {
    const parts = allocateCents(1000, [1, 1, 1]);
    assert.equal(parts.reduce((a, b) => a + b, 0), 1000);
    assert.deepEqual(parts, [334, 333, 333]);
  });
});

describe("valueReturn", () => {
  const invoice = {
    total: 407,
    tax: 37,
    returned_amount: 0,
    returned_tax: 0,
    lines: [
      { id: 1, quantity: 3, returned_quantity: 0, subtotal: 290 },
      { id: 2, quantity: 2, returned_quantity: 0, subtotal: 100 },
    ],
  };

  it("values a partial return at the effective price including discount and tax", () => {
    const result = valueReturn(invoice, [{ lineId: 1, quantity: 1 }]);
    assert.equal(result.total, 100.88);
    assert.equal(result.tax, 9.17);
  });

  it("returns exactly the remaining invoice value when everything comes back", () => {
    const first = valueReturn(invoice, [{ lineId: 1, quantity: 1 }]);
    const result = valueReturn(
      {
        ...invoice,
        returned_amount: first.total,
        returned_tax: first.tax,
        lines: [
          { id: 1, quantity: 3, returned_quantity: 1, subtotal: 290 },
          { id: 2, quantity: 2, returned_quantity: 0, subtotal: 100 },
        ],
      },
      [{ lineId: 1, quantity: 2 }, { lineId: 2, quantity: 2 }],
    );
    assert.equal(Math.round((first.total + result.total) * 100), 40700);
    assert.equal(Math.round((first.tax + result.tax) * 100), 3700);
  });

  it("rejects returning more than was sold", () => {
    assert.throws(() => valueReturn(invoice, [{ lineId: 2, quantity: 3 }]), /can still be returned/);
    assert.throws(() => valueReturn(invoice, [{ lineId: 9, quantity: 1 }]), /does not belong/);
  });
});

describe("profitAndLoss", () => {
  it("derives revenue, gross and net profit from database totals", () => {
    const pl = profitAndLoss({
      sales_total: 1100, sales_tax: 100, sales_cost: 600,
      sales_returns_total: 110, sales_returns_tax: 10, sales_returns_cost: 60,
      expenses_total: 150, purchases_total: 800, purchase_returns_total: 50,
      expenses_by_category: { rent: 150 },
    });
    assert.equal(pl.revenue, 900);
    assert.equal(pl.costOfGoodsSold, 540);
    assert.equal(pl.grossProfit, 360);
    assert.equal(pl.netProfit, 210);
    assert.equal(pl.netPurchases, 750);
    assert.equal(pl.grossMargin, 40);
  });
});
