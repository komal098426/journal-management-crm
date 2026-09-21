import type { Request, Response } from "express";
import { z } from "zod";
import { parse } from "../middleware/validate.js";
import * as hr from "../services/hr.service.js";
import { idOf, listQueryOf, sendList } from "../utils/http.js";
import { optionalId } from "../validators/common.js";
import { attendanceSchema, departmentSchema, employeeSchema, operationSchema, taskSchema } from "../validators/erp.js";

type Resource = {
  list: (query: ReturnType<typeof listQueryOf>) => Promise<{ rows: unknown[]; count: number }>;
  get: (id: number) => Promise<unknown>;
  create: (values: Record<string, unknown>) => Promise<unknown>;
  update: (id: number, values: Record<string, unknown>) => Promise<unknown>;
  remove: (id: number) => Promise<unknown>;
};

/** Standard REST handlers for a workforce resource. */
function handlers(resource: Resource, schema: z.ZodType) {
  return {
    list: async (req: Request, res: Response) => {
      const query = listQueryOf(req);
      sendList(res, query, await resource.list(query));
    },
    get: async (req: Request, res: Response) => {
      res.json(await resource.get(idOf(req)));
    },
    create: async (req: Request, res: Response) => {
      res.status(201).json(await resource.create(parse(schema, req.body) as Record<string, unknown>));
    },
    update: async (req: Request, res: Response) => {
      res.json(await resource.update(idOf(req), parse(schema, req.body) as Record<string, unknown>));
    },
    remove: async (req: Request, res: Response) => {
      await resource.remove(idOf(req));
      res.status(204).end();
    },
  };
}

export const departments = handlers(hr.departments, departmentSchema);
export const operations = handlers(hr.operations, operationSchema);
export const attendance = handlers(hr.attendance, attendanceSchema);
export const tasks = handlers(hr.tasks, taskSchema);

const employeeFilters = z.object({ department_id: optionalId.optional(), status: z.enum(["Active", "On leave", "Offline"]).optional() });

export const employees = {
  list: async (req: Request, res: Response) => {
    const query = listQueryOf(req);
    sendList(res, query, await hr.listEmployees(query, parse(employeeFilters, req.query)));
  },
  get: async (req: Request, res: Response) => {
    res.json(await hr.getEmployee(idOf(req)));
  },
  create: async (req: Request, res: Response) => {
    res.status(201).json(await hr.createEmployee(parse(employeeSchema, req.body)));
  },
  update: async (req: Request, res: Response) => {
    res.json(await hr.updateEmployee(idOf(req), parse(employeeSchema, req.body)));
  },
  remove: async (req: Request, res: Response) => {
    await hr.deleteEmployee(idOf(req));
    res.status(204).end();
  },
};
