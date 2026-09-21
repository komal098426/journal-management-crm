import type { Request, Response } from "express";
import { z } from "zod";
import { parse } from "../middleware/validate.js";
import * as parties from "../services/parties.service.js";
import { idOf, listQueryOf, sendList } from "../utils/http.js";
import { partySchema } from "../validators/erp.js";

const balanceFilter = z.object({ balance: z.enum(["outstanding", "clear", "credit"]).optional() });

export async function listCustomers(req: Request, res: Response) {
  const query = listQueryOf(req);
  sendList(res, query, await parties.listCustomers(query, parse(balanceFilter, req.query).balance));
}
export async function getCustomer(req: Request, res: Response) {
  res.json(await parties.getCustomer(idOf(req)));
}
export async function createCustomer(req: Request, res: Response) {
  res.status(201).json(await parties.createCustomer(parse(partySchema, req.body)));
}
export async function updateCustomer(req: Request, res: Response) {
  res.json(await parties.updateCustomer(idOf(req), parse(partySchema, req.body)));
}
export async function deleteCustomer(req: Request, res: Response) {
  await parties.deleteCustomer(idOf(req));
  res.status(204).end();
}

export async function listSuppliers(req: Request, res: Response) {
  const query = listQueryOf(req);
  sendList(res, query, await parties.listSuppliers(query, parse(balanceFilter, req.query).balance));
}
export async function getSupplier(req: Request, res: Response) {
  res.json(await parties.getSupplier(idOf(req)));
}
export async function createSupplier(req: Request, res: Response) {
  res.status(201).json(await parties.createSupplier(parse(partySchema, req.body)));
}
export async function updateSupplier(req: Request, res: Response) {
  res.json(await parties.updateSupplier(idOf(req), parse(partySchema, req.body)));
}
export async function deleteSupplier(req: Request, res: Response) {
  await parties.deleteSupplier(idOf(req));
  res.status(204).end();
}
