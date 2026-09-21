import type { z } from "zod";
import { supabase } from "../config/supabase.js";
import { ApiError } from "../utils/errors.js";
import type { ListQuery } from "../utils/query.js";
import type { attendanceSchema, departmentSchema, employeeSchema, operationSchema, taskSchema } from "../validators/erp.js";
import { crud } from "./resource.js";

export const departments = crud({
  table: "departments",
  view: "v_departments",
  label: "Department",
  sortable: ["name", "code", "employee_count", "created_at"],
  defaultSort: "name",
  searchColumns: ["name", "code", "head"],
});

const employees = crud({
  table: "employees",
  view: "v_employees",
  label: "Employee",
  sortable: ["name", "employee_code", "department_name", "status", "joining_date", "created_at"],
  defaultSort: "name",
  searchColumns: ["name", "employee_code", "department_name", "role", "email"],
  inUseMessage: "This employee cannot be deleted",
});

export const operations = crud({
  table: "operations",
  view: "v_operations",
  label: "Operation record",
  sortable: ["entry_date", "start_time", "status", "employee_name", "created_at"],
  defaultSort: "entry_date",
  searchColumns: ["work", "employee_name", "department_name", "description"],
  dateColumn: "entry_date",
});

export const attendance = crud({
  table: "attendance",
  view: "v_attendance",
  label: "Attendance record",
  sortable: ["attendance_date", "employee_name", "status", "check_in"],
  defaultSort: "attendance_date",
  searchColumns: ["employee_name", "department_name"],
  dateColumn: "attendance_date",
});

export const tasks = crud({
  table: "tasks",
  view: "v_tasks",
  label: "Task",
  sortable: ["due_date", "title", "priority", "status", "employee_name", "created_at"],
  defaultSort: "created_at",
  searchColumns: ["title", "employee_name", "department_name"],
});

export const listEmployees = (query: ListQuery, filters: { department_id?: number | null; status?: string }) =>
  employees.list(query, q => {
    if (filters.department_id) q = q.eq("department_id", filters.department_id);
    if (filters.status) q = q.eq("status", filters.status);
    return q;
  });
export const getEmployee = employees.get;
export const updateEmployee = (id: number, input: z.infer<typeof employeeSchema>) => {
  const { employee_code, ...rest } = input;
  return employees.update(id, employee_code ? { ...rest, employee_code } : rest);
};
export const deleteEmployee = employees.remove;

/** Creates an employee, generating the next EMP-### code when none is given. */
export async function createEmployee(input: z.infer<typeof employeeSchema>) {
  if (input.employee_code) return employees.create(input);
  for (let attempt = 0; attempt < 5; attempt++) {
    const { count } = await supabase.from("employees").select("id", { count: "exact", head: true });
    const code = `EMP-${String((count ?? 0) + 1 + attempt).padStart(3, "0")}`;
    try {
      return await employees.create({ ...input, employee_code: code });
    } catch (error) {
      if (!(error instanceof ApiError && error.code === "DUPLICATE")) throw error;
    }
  }
  throw new ApiError(409, "Could not generate a unique employee ID. Enter one manually.", "DUPLICATE");
}

export type DepartmentInput = z.infer<typeof departmentSchema>;
export type OperationInput = z.infer<typeof operationSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
