import type { Request, Response } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import * as inventory from "../services/inventory.service.js";
import { idOf, listQueryOf, sendList } from "../utils/http.js";
import { optionalId } from "../validators/common.js";
import { categorySchema, productCreateSchema, productUpdateSchema, stockAdjustmentSchema } from "../validators/erp.js";

const productFilters = z.object({
  category_id: optionalId.optional(),
  supplier_id: optionalId.optional(),
  status: z.enum(["active", "inactive"]).optional(),
  stock_status: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional(),
});

export async function listProducts(req: Request, res: Response) {
  const query = listQueryOf(req);
  sendList(res, query, await inventory.listProducts(query, parse(productFilters, req.query)));
}

export async function lowStock(_req: Request, res: Response) {
  res.json({ data: await inventory.lowStockProducts(50) });
}

export async function getProduct(req: Request, res: Response) {
  res.json(await inventory.getProduct(idOf(req)));
}

export async function createProduct(req: Request, res: Response) {
  res.status(201).json(await inventory.createProduct(parse(productCreateSchema, req.body), currentUser(req)));
}

export async function updateProduct(req: Request, res: Response) {
  res.json(await inventory.updateProduct(idOf(req), parse(productUpdateSchema, req.body)));
}

export async function deleteProduct(req: Request, res: Response) {
  await inventory.deleteProduct(idOf(req));
  res.status(204).end();
}

export async function listCategories(req: Request, res: Response) {
  const query = listQueryOf(req);
  sendList(res, query, await inventory.listCategories(query));
}

export async function getCategory(req: Request, res: Response) {
  res.json(await inventory.getCategory(idOf(req)));
}

export async function createCategory(req: Request, res: Response) {
  res.status(201).json(await inventory.createCategory(parse(categorySchema, req.body)));
}

export async function updateCategory(req: Request, res: Response) {
  res.json(await inventory.updateCategory(idOf(req), parse(categorySchema, req.body)));
}

export async function deleteCategory(req: Request, res: Response) {
  await inventory.deleteCategory(idOf(req));
  res.status(204).end();
}

export async function listAdjustments(req: Request, res: Response) {
  const query = listQueryOf(req);
  const { product_id } = parse(z.object({ product_id: optionalId.optional() }), req.query);
  sendList(res, query, await inventory.listAdjustments(query, product_id));
}

export async function createAdjustment(req: Request, res: Response) {
  res.status(201).json(await inventory.createAdjustment(parse(stockAdjustmentSchema, req.body), currentUser(req)));
}

export async function listMovements(req: Request, res: Response) {
  const query = listQueryOf(req);
  const filters = parse(z.object({ product_id: optionalId.optional(), movement_type: z.string().max(30).optional() }), req.query);
  sendList(res, query, await inventory.listMovements(query, filters));
}
