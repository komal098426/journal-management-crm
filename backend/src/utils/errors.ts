export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new ApiError(400, message, "BAD_REQUEST", details);
export const unauthorized = (message = "Please sign in to continue") => new ApiError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "You do not have permission to perform this action") => new ApiError(403, message, "FORBIDDEN");
export const notFound = (message = "Record not found") => new ApiError(404, message, "NOT_FOUND");
export const conflict = (message: string) => new ApiError(409, message, "CONFLICT");

type DbError = { code?: string; message: string; details?: string | null; hint?: string | null };

// Status for business errors raised by the database functions as 'ERP:<CODE>:<message>'.
const BUSINESS_STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  INSUFFICIENT_STOCK: 409,
  ALREADY_CANCELLED: 409,
  SALE_CANCELLED: 409,
  PURCHASE_CANCELLED: 409,
  SALE_HAS_RETURNS: 409,
  PURCHASE_HAS_RETURNS: 409,
  CUSTOMER_LOCKED: 409,
  SUPPLIER_LOCKED: 409,
  BALANCE_MISMATCH: 409,
  NOTHING_OUTSTANDING: 409,
};

const UNIQUE_MESSAGES: Record<string, string> = {
  products_sku_key: "A product with this SKU already exists",
  categories_name_key: "A category with this name already exists",
  departments_name_key: "A department with this name already exists",
  employees_employee_code_key: "An employee with this ID already exists",
  attendance_one_per_day: "Attendance for this employee is already recorded on that date",
  purchases_invoice_per_supplier: "This supplier invoice number has already been recorded",
  users_email_key: "A user with this email already exists",
};

/** Converts a Supabase/PostgREST error into a safe, user-facing ApiError. */
export function fromDbError(error: DbError, context: { action?: "delete" } = {}): ApiError {
  const businessMatch = /^ERP:([A-Z_]+):(.*)$/s.exec(error.message);
  if (businessMatch) {
    const [, code, message] = businessMatch;
    return new ApiError(BUSINESS_STATUS[code] ?? 422, message.trim(), code);
  }

  switch (error.code) {
    case "23505": {
      const constraint = /constraint "([^"]+)"/.exec(error.message)?.[1] ?? "";
      return new ApiError(409, UNIQUE_MESSAGES[constraint] ?? "A record with these details already exists", "DUPLICATE");
    }
    case "23503":
      return context.action === "delete"
        ? new ApiError(409, "This record is used by other transactions and cannot be deleted", "IN_USE")
        : new ApiError(400, "A referenced record does not exist", "INVALID_REFERENCE");
    case "23514":
      return new ApiError(400, "One or more values are outside the allowed range", "CHECK_VIOLATION");
    case "22P02":
    case "22003":
    case "22007":
    case "22008":
      return new ApiError(400, "One or more values have an invalid format", "INVALID_INPUT");
    case "PGRST116":
      return notFound();
    default:
      console.error("[database]", error.code, error.message, error.details ?? "", error.hint ?? "");
      return new ApiError(500, "Something went wrong while talking to the database", "DATABASE_ERROR");
  }
}
