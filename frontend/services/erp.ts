"use client";

import { api } from "@/lib/api";
import type {
  AppUser, AttendanceRecord, Category, Customer, CustomerDetail, Dashboard, Department, Employee, Expense,
  Me, Operation, Paginated, Payment, Product, ProductDetail, Purchase, PurchaseDetail, PurchaseReturn,
  ReportResult, ReportType, Sale, SaleDetail, SalesReturn, Settings, StockAdjustment, StockMovement,
  Supplier, SupplierDetail, Task,
} from "@/types/erp";

type Query = Record<string, string | number | boolean | null | undefined>;
type Body = Record<string, unknown>;

function resource<T, TDetail = T>(path: string) {
  return {
    list: (query: Query = {}) => api.get<Paginated<T>>(path, query),
    get: (id: number) => api.get<TDetail>(`${path}/${id}`),
    create: (body: Body) => api.post<TDetail>(path, body),
    update: (id: number, body: Body) => api.put<TDetail>(`${path}/${id}`, body),
    remove: (id: number) => api.delete(`${path}/${id}`),
  };
}

export const authService = {
  me: () => api.get<Me>("/auth/me"),
  users: () => api.get<{ data: AppUser[] }>("/auth/users"),
  createUser: (body: Body) => api.post<AppUser>("/auth/users", body),
  updateUser: (id: string, body: Body) => api.patch<AppUser>(`/auth/users/${id}`, body),
  settings: () => api.get<Settings>("/auth/settings"),
  updateSettings: (body: Body) => api.put<Settings>("/auth/settings", body),
};

export const dashboardService = {
  get: (query: Query) => api.get<Dashboard>("/dashboard", query),
};

export const reportService = {
  types: () => api.get<{ data: { type: ReportType; title: string }[] }>("/reports"),
  run: (type: ReportType, query: Query) => api.get<ReportResult>(`/reports/${type}`, query),
};

export const productService = {
  ...resource<Product, ProductDetail>("/products"),
  lowStock: () => api.get<{ data: Product[] }>("/products/low-stock"),
};
export const categoryService = resource<Category>("/categories");
export const stockService = {
  adjustments: (query: Query = {}) => api.get<Paginated<StockAdjustment>>("/stock-adjustments", query),
  adjust: (body: Body) => api.post<StockAdjustment>("/stock-adjustments", body),
  movements: (query: Query = {}) => api.get<Paginated<StockMovement>>("/stock-movements", query),
};

export const customerService = resource<Customer, CustomerDetail>("/customers");
export const supplierService = resource<Supplier, SupplierDetail>("/suppliers");

export const saleService = {
  ...resource<Sale, SaleDetail>("/sales"),
  invoice: (id: number) => api.get<{ sale: SaleDetail; settings: Settings }>(`/sales/${id}/invoice`),
  cancel: (id: number, body: Body = {}) => api.post<SaleDetail>(`/sales/${id}/cancel`, body),
};

export const purchaseService = {
  ...resource<Purchase, PurchaseDetail>("/purchases"),
  cancel: (id: number, body: Body = {}) => api.post<PurchaseDetail>(`/purchases/${id}/cancel`, body),
};

export const salesReturnService = {
  list: (query: Query = {}) => api.get<Paginated<SalesReturn>>("/sales-returns", query),
  create: (body: Body) => api.post<SalesReturn>("/sales-returns", body),
};

export const purchaseReturnService = {
  list: (query: Query = {}) => api.get<Paginated<PurchaseReturn>>("/purchase-returns", query),
  create: (body: Body) => api.post<PurchaseReturn>("/purchase-returns", body),
};

export const paymentService = {
  list: (query: Query = {}) => api.get<Paginated<Payment>>("/payments", query),
  create: (body: Body) => api.post<Payment>("/payments", body),
};

export const expenseService = resource<Expense>("/expenses");

export const departmentService = resource<Department>("/departments");
export const employeeService = resource<Employee>("/employees");
export const operationService = resource<Operation>("/operations");
export const attendanceService = resource<AttendanceRecord>("/attendance");
export const taskService = resource<Task>("/tasks");
