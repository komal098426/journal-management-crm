import type { Request, Response } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import * as finance from "../services/finance.service.js";
import * as purchases from "../services/purchases.service.js";
import * as returns from "../services/returns.service.js";
import * as sales from "../services/sales.service.js";
import { idOf, listQueryOf, sendList } from "../utils/http.js";
import { optionalId, paymentMethod } from "../validators/common.js";
import {
  cancelSchema, EXPENSE_CATEGORIES, expenseSchema, paymentSchema, purchaseCreateSchema, purchaseReturnSchema,
  purchaseUpdateSchema, saleCreateSchema, saleUpdateSchema, salesReturnSchema,
} from "../validators/erp.js";

const invoiceStatus = z.enum(["paid", "partial", "unpaid", "returned", "cancelled"]).optional();

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
export async function listSales(req: Request, res: Response) {
  const query = listQueryOf(req);
  const filters = parse(z.object({ status: invoiceStatus, customer_id: optionalId.optional() }), req.query);
  sendList(res, query, await sales.listSales(query, filters));
}
export async function getSale(req: Request, res: Response) {
  res.json(await sales.getSale(idOf(req)));
}
export async function getInvoice(req: Request, res: Response) {
  res.json(await sales.getInvoice(idOf(req)));
}
export async function createSale(req: Request, res: Response) {
  res.status(201).json(await sales.createSale(parse(saleCreateSchema, req.body), currentUser(req)));
}
export async function updateSale(req: Request, res: Response) {
  res.json(await sales.updateSale(idOf(req), parse(saleUpdateSchema, req.body), currentUser(req)));
}
export async function cancelSale(req: Request, res: Response) {
  res.json(await sales.cancelSale(idOf(req), parse(cancelSchema, req.body ?? {}), currentUser(req)));
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------
export async function listPurchases(req: Request, res: Response) {
  const query = listQueryOf(req);
  const filters = parse(z.object({ status: invoiceStatus, supplier_id: optionalId.optional() }), req.query);
  sendList(res, query, await purchases.listPurchases(query, filters));
}
export async function getPurchase(req: Request, res: Response) {
  res.json(await purchases.getPurchase(idOf(req)));
}
export async function createPurchase(req: Request, res: Response) {
  res.status(201).json(await purchases.createPurchase(parse(purchaseCreateSchema, req.body), currentUser(req)));
}
export async function updatePurchase(req: Request, res: Response) {
  res.json(await purchases.updatePurchase(idOf(req), parse(purchaseUpdateSchema, req.body), currentUser(req)));
}
export async function cancelPurchase(req: Request, res: Response) {
  res.json(await purchases.cancelPurchase(idOf(req), parse(cancelSchema, req.body ?? {}), currentUser(req)));
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------
export async function listSalesReturns(req: Request, res: Response) {
  const query = listQueryOf(req);
  const filters = parse(z.object({ sale_id: optionalId.optional(), customer_id: optionalId.optional() }), req.query);
  sendList(res, query, await returns.listSalesReturns(query, filters));
}
export async function getSalesReturn(req: Request, res: Response) {
  res.json(await returns.getSalesReturn(idOf(req)));
}
export async function createSalesReturn(req: Request, res: Response) {
  res.status(201).json(await returns.createSalesReturn(parse(salesReturnSchema, req.body), currentUser(req)));
}
export async function listPurchaseReturns(req: Request, res: Response) {
  const query = listQueryOf(req);
  const filters = parse(z.object({ purchase_id: optionalId.optional(), supplier_id: optionalId.optional() }), req.query);
  sendList(res, query, await returns.listPurchaseReturns(query, filters));
}
export async function getPurchaseReturn(req: Request, res: Response) {
  res.json(await returns.getPurchaseReturn(idOf(req)));
}
export async function createPurchaseReturn(req: Request, res: Response) {
  res.status(201).json(await returns.createPurchaseReturn(parse(purchaseReturnSchema, req.body), currentUser(req)));
}

// ---------------------------------------------------------------------------
// Payments & expenses
// ---------------------------------------------------------------------------
export async function listPayments(req: Request, res: Response) {
  const query = listQueryOf(req);
  const filters = parse(z.object({
    party_type: z.enum(["customer", "supplier", "expense"]).optional(),
    customer_id: optionalId.optional(),
    supplier_id: optionalId.optional(),
    direction: z.enum(["in", "out"]).optional(),
    payment_method: paymentMethod.optional(),
  }), req.query);
  sendList(res, query, await finance.listPayments(query, currentUser(req), filters));
}
export async function createPayment(req: Request, res: Response) {
  res.status(201).json(await finance.createPayment(parse(paymentSchema, req.body), currentUser(req)));
}

export async function listExpenses(req: Request, res: Response) {
  const query = listQueryOf(req);
  const filters = parse(z.object({ category: z.enum(EXPENSE_CATEGORIES).optional(), payment_method: paymentMethod.optional() }), req.query);
  sendList(res, query, await finance.listExpenses(query, filters));
}
export async function getExpense(req: Request, res: Response) {
  res.json(await finance.getExpense(idOf(req)));
}
export async function createExpense(req: Request, res: Response) {
  res.status(201).json(await finance.createExpense(parse(expenseSchema, req.body), currentUser(req)));
}
export async function updateExpense(req: Request, res: Response) {
  res.json(await finance.updateExpense(idOf(req), parse(expenseSchema, req.body)));
}
export async function deleteExpense(req: Request, res: Response) {
  await finance.deleteExpense(idOf(req));
  res.status(204).end();
}
