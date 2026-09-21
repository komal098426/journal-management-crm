import type { Request, Response } from "express";
import { z } from "zod";
import { parse } from "../middleware/validate.js";
import { idParam, listQuerySchema, paginated, type ListQuery } from "./query.js";

export const idOf = (req: Request) => parse(idParam, req.params.id);
export const uuidOf = (req: Request) => parse(z.uuid("Invalid user id"), req.params.id);
export const listQueryOf = (req: Request): ListQuery => parse(listQuerySchema, req.query);

export function sendList(res: Response, query: ListQuery, result: { rows: unknown[]; count: number }) {
  res.json(paginated(result.rows, result.count, query));
}
