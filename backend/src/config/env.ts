import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  SUPABASE_URL: z.url({ message: "SUPABASE_URL must be the project URL, e.g. https://xyz.supabase.co" }),
  SUPABASE_SERVICE_ROLE_KEY: z.string({ message: "SUPABASE_SERVICE_ROLE_KEY is required (Project Settings → API keys)" }).min(20, "SUPABASE_SERVICE_ROLE_KEY is required (Project Settings → API keys)"),
  FRONTEND_ORIGIN: z.string().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("Asia/Karachi"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(`Invalid backend environment:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  frontendOrigins: parsed.data.FRONTEND_ORIGIN.split(",").map(origin => origin.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === "production",
};
