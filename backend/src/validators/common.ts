import { z } from "zod";
import { isoDate } from "../utils/query.js";

export { isoDate };

export const PAYMENT_METHODS = ["cash", "bank", "card", "online_transfer"] as const;
export const paymentMethod = z.enum(PAYMENT_METHODS, { message: "Choose cash, bank, card or online transfer" });

export const money = z.coerce.number({ message: "Enter an amount" }).finite().min(0, "Amounts cannot be negative").max(1e11, "Amount is too large");
export const positiveMoney = money.refine(value => value > 0, "Amount must be greater than zero");
export const quantity = z.coerce.number({ message: "Enter a quantity" }).finite().positive("Quantity must be greater than zero").max(1e9, "Quantity is too large")
  .refine(value => Math.round(value * 1000) === value * 1000 || Math.abs(Math.round(value * 1000) - value * 1000) < 1e-6, "Use at most 3 decimal places");

export const id = z.coerce.number({ message: "Select a record" }).int().positive("Select a record");

/** Accepts null, "" or undefined as "no value". */
export const optionalId = z.preprocess(value => (value === "" || value === undefined ? null : value), id.nullable());

export const text = (max = 200) => z.string().trim().max(max, `Keep this under ${max} characters`);
export const requiredText = (label: string, max = 200) => text(max).min(1, `${label} is required`);
export const optionalText = (max = 500) =>
  z.preprocess(value => (value === null || value === undefined ? "" : value), text(max)).transform(value => value || null);

export const optionalEmail = z.preprocess(
  value => (value === null || value === undefined ? "" : String(value).trim()),
  z.union([z.literal(""), z.email("Enter a valid email address")]),
).transform(value => value || null);

export const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM time");
