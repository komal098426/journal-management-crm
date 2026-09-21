import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import * as users from "../services/users.service.js";
import { uuidOf } from "../utils/http.js";
import { settingsSchema, userCreateSchema, userUpdateSchema } from "../validators/erp.js";

export function me(req: Request, res: Response) {
  const user = currentUser(req);
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, permissions: user.permissions });
}

export async function listUsers(_req: Request, res: Response) {
  res.json({ data: await users.listUsers() });
}

export async function createUser(req: Request, res: Response) {
  res.status(201).json(await users.createUser(parse(userCreateSchema, req.body)));
}

export async function updateUser(req: Request, res: Response) {
  res.json(await users.updateUser(uuidOf(req), parse(userUpdateSchema, req.body), currentUser(req)));
}

export async function getSettings(_req: Request, res: Response) {
  res.json(await users.getSettings());
}

export async function updateSettings(req: Request, res: Response) {
  res.json(await users.updateSettings(parse(settingsSchema, req.body)));
}
