import type { z } from "zod";
import { supabase } from "../config/supabase.js";
import { clearAuthCache, type AuthUser } from "../middleware/auth.js";
import { unwrap } from "../utils/db.js";
import { ApiError, badRequest, conflict } from "../utils/errors.js";
import type { settingsSchema, userCreateSchema, userUpdateSchema } from "../validators/erp.js";
import { getRow } from "./resource.js";

export async function listUsers() {
  return unwrap(await supabase.from("users").select("*").order("created_at"));
}

export async function createUser(input: z.infer<typeof userCreateSchema>): Promise<Awaited<ReturnType<typeof getRow>>> {
  const { data, error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name },
    app_metadata: { role: input.role },
  });
  if (error || !data.user) {
    const message = error?.message ?? "";
    if (/already|registered|exists/i.test(message)) throw conflict("A user with this email already exists");
    if (/password/i.test(message)) throw badRequest(message);
    console.error("[auth] createUser failed:", message);
    throw new ApiError(500, "Could not create the user account", "AUTH_ERROR");
  }

  // The auth trigger creates the profile; make sure name and role are exact.
  return unwrap(
    await supabase.from("users")
      .upsert({ id: data.user.id, email: input.email, name: input.name, role: input.role }, { onConflict: "id" })
      .select().single(),
  );
}

export async function updateUser(id: string, input: z.infer<typeof userUpdateSchema>, actor: AuthUser) {
  const target = await getRow("users", id, "User");
  const losesAdmin = target.role === "admin" && ((input.role && input.role !== "admin") || input.is_active === false);

  if (actor.id === id && losesAdmin) throw badRequest("You cannot remove your own admin access");
  if (losesAdmin) {
    const admins = await supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true);
    if ((admins.count ?? 0) <= 1) throw conflict("At least one active admin is required");
  }

  if (input.is_active !== undefined || input.role) {
    const { error } = await supabase.auth.admin.updateUserById(id, {
      ...(input.is_active !== undefined ? { ban_duration: input.is_active ? "none" : "876000h" } : {}),
      ...(input.role ? { app_metadata: { role: input.role } } : {}),
    });
    if (error) {
      console.error("[auth] updateUserById failed:", error.message);
      throw new ApiError(500, "Could not update the user account", "AUTH_ERROR");
    }
  }

  const updated = unwrap(await supabase.from("users").update(input).eq("id", id).select().single());
  clearAuthCache();
  return updated;
}

export async function getSettings() {
  return unwrap(await supabase.from("workspace_settings").select("*").eq("id", 1).single());
}

export async function updateSettings(input: z.infer<typeof settingsSchema>) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw badRequest("Timezone must be a valid IANA name, e.g. Asia/Karachi");
  }
  return unwrap(await supabase.from("workspace_settings").update(input).eq("id", 1).select().single());
}
