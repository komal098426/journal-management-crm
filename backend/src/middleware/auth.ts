import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { can, ROLE_PERMISSIONS, type Permission, type Role } from "../config/permissions.js";
import { supabase } from "../config/supabase.js";
import { forbidden, fromDbError, unauthorized } from "../utils/errors.js";

export type AuthUser = { id: string; email: string; name: string; role: Role; permissions: readonly Permission[] };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Short cache so every request does not round-trip to Supabase Auth.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { user: AuthUser; expires: number }>();

export function clearAuthCache() {
  cache.clear();
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw unauthorized();

  const key = createHash("sha256").update(token).digest("hex");
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    req.user = cached.user;
    return next();
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw unauthorized("Your session has expired. Please sign in again.");

  const profile = await supabase.from("users").select("id, email, name, role, is_active").eq("id", data.user.id).maybeSingle();
  if (profile.error) throw fromDbError(profile.error);
  if (!profile.data) throw forbidden("Your account has no ERP profile. Ask an administrator for access.");
  if (!profile.data.is_active) throw forbidden("Your account has been deactivated");

  const role = profile.data.role as Role;
  const user: AuthUser = { id: profile.data.id, email: profile.data.email, name: profile.data.name, role, permissions: ROLE_PERMISSIONS[role] };
  if (cache.size > 1000) cache.clear();
  cache.set(key, { user, expires: Date.now() + CACHE_TTL_MS });
  req.user = user;
  next();
}

/** Allows the request when the user holds at least one of the permissions. */
export const requirePermission = (...permissions: Permission[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw unauthorized();
    if (!permissions.some(permission => can(req.user!.role, permission))) throw forbidden();
    next();
  };

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
