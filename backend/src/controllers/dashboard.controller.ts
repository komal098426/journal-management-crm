import type { Request, Response } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { getDashboard } from "../services/dashboard.service.js";
import { availableReports, REPORTS, runReport, type ReportType } from "../services/reports.service.js";
import { toCsv } from "../utils/csv.js";
import { resolveRange, today } from "../utils/dates.js";
import { badRequest } from "../utils/errors.js";
import { listQueryOf } from "../utils/http.js";
import { rangeQuerySchema } from "../validators/erp.js";

export async function dashboard(req: Request, res: Response) {
  const { range, from, to } = parse(rangeQuerySchema, req.query);
  res.json(await getDashboard(currentUser(req), resolveRange(range, from, to)));
}

export function reportTypes(req: Request, res: Response) {
  res.json({ data: availableReports(currentUser(req)) });
}

const reportFilters = z.object({
  status: z.string().max(30).optional(),
  stock_status: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional(),
  balance: z.enum(["outstanding", "clear", "credit"]).optional(),
  category: z.string().max(30).optional(),
  party_type: z.enum(["customer", "supplier", "expense"]).optional(),
  direction: z.enum(["in", "out"]).optional(),
});

export async function report(req: Request, res: Response) {
  const type = req.params.type as ReportType;
  if (!(type in REPORTS)) throw badRequest(`Unknown report "${req.params.type}"`);
  const query = listQueryOf(req);
  if (query.from && query.to && query.from > query.to) throw badRequest("The start date must be on or before the end date");

  const result = await runReport(type, query, parse(reportFilters, req.query), currentUser(req));

  if (query.format === "csv") {
    const csv = toCsv(
      result.columns.map(column => ({ key: column.key, label: column.label })),
      result.rows,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-report-${today()}.csv"`);
    res.send(csv);
    return;
  }
  res.json({ ...result, page: query.page, pageSize: query.pageSize });
}
