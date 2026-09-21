import { Router, type RequestHandler } from "express";
import * as auth from "../controllers/auth.controller.js";
import * as dashboard from "../controllers/dashboard.controller.js";
import * as hr from "../controllers/hr.controller.js";
import * as inventory from "../controllers/inventory.controller.js";
import * as parties from "../controllers/parties.controller.js";
import * as tx from "../controllers/transactions.controller.js";
import type { Permission } from "../config/permissions.js";
import { authenticate, requirePermission as allow } from "../middleware/auth.js";

type Crud = { list: RequestHandler; get: RequestHandler; create: RequestHandler; update: RequestHandler; remove: RequestHandler };

function crudRouter(handlers: Crud, read: Permission, write: Permission, remove: Permission = write) {
  const router = Router();
  router.get("/", allow(read), handlers.list);
  router.get("/:id", allow(read), handlers.get);
  router.post("/", allow(write), handlers.create);
  router.put("/:id", allow(write), handlers.update);
  router.delete("/:id", allow(remove), handlers.remove);
  return router;
}

export const apiRouter = Router();

// Everything below requires a valid Supabase session; authorization is per route.
apiRouter.use(authenticate);

// Auth, users & settings
const authRouter = Router();
authRouter.get("/me", auth.me);
authRouter.get("/users", allow("users:manage"), auth.listUsers);
authRouter.post("/users", allow("users:manage"), auth.createUser);
authRouter.patch("/users/:id", allow("users:manage"), auth.updateUser);
authRouter.get("/settings", auth.getSettings);
authRouter.put("/settings", allow("settings:write"), auth.updateSettings);
apiRouter.use("/auth", authRouter);

// Dashboard & reports
apiRouter.get("/dashboard", allow("dashboard:read"), dashboard.dashboard);
apiRouter.get("/reports", dashboard.reportTypes);
apiRouter.get("/reports/:type", dashboard.report);

// Inventory
const products = Router();
products.get("/", allow("inventory:read"), inventory.listProducts);
products.get("/low-stock", allow("inventory:read"), inventory.lowStock);
products.get("/:id", allow("inventory:read"), inventory.getProduct);
products.post("/", allow("inventory:write"), inventory.createProduct);
products.put("/:id", allow("inventory:write"), inventory.updateProduct);
products.delete("/:id", allow("inventory:delete"), inventory.deleteProduct);
apiRouter.use("/products", products);

apiRouter.use("/categories", crudRouter({
  list: inventory.listCategories, get: inventory.getCategory, create: inventory.createCategory,
  update: inventory.updateCategory, remove: inventory.deleteCategory,
}, "inventory:read", "inventory:write", "inventory:delete"));

const adjustments = Router();
adjustments.get("/", allow("inventory:read"), inventory.listAdjustments);
adjustments.post("/", allow("inventory:write"), inventory.createAdjustment);
apiRouter.use("/stock-adjustments", adjustments);
apiRouter.get("/stock-movements", allow("inventory:read"), inventory.listMovements);

// Customers & suppliers
apiRouter.use("/customers", crudRouter({
  list: parties.listCustomers, get: parties.getCustomer, create: parties.createCustomer,
  update: parties.updateCustomer, remove: parties.deleteCustomer,
}, "customers:read", "customers:write", "customers:delete"));

apiRouter.use("/suppliers", crudRouter({
  list: parties.listSuppliers, get: parties.getSupplier, create: parties.createSupplier,
  update: parties.updateSupplier, remove: parties.deleteSupplier,
}, "suppliers:read", "suppliers:write", "suppliers:delete"));

// Sales
const sales = Router();
sales.get("/", allow("sales:read"), tx.listSales);
sales.get("/:id", allow("sales:read"), tx.getSale);
sales.get("/:id/invoice", allow("sales:read"), tx.getInvoice);
sales.post("/", allow("sales:write"), tx.createSale);
sales.put("/:id", allow("sales:write"), tx.updateSale);
sales.post("/:id/cancel", allow("sales:cancel"), tx.cancelSale);
apiRouter.use("/sales", sales);

// Purchases
const purchases = Router();
purchases.get("/", allow("purchases:read"), tx.listPurchases);
purchases.get("/:id", allow("purchases:read"), tx.getPurchase);
purchases.post("/", allow("purchases:write"), tx.createPurchase);
purchases.put("/:id", allow("purchases:write"), tx.updatePurchase);
purchases.post("/:id/cancel", allow("purchases:cancel"), tx.cancelPurchase);
apiRouter.use("/purchases", purchases);

// Returns
const salesReturns = Router();
salesReturns.get("/", allow("sales:read"), tx.listSalesReturns);
salesReturns.get("/:id", allow("sales:read"), tx.getSalesReturn);
salesReturns.post("/", allow("sales:write"), tx.createSalesReturn);
apiRouter.use("/sales-returns", salesReturns);

const purchaseReturns = Router();
purchaseReturns.get("/", allow("purchases:read"), tx.listPurchaseReturns);
purchaseReturns.get("/:id", allow("purchases:read"), tx.getPurchaseReturn);
purchaseReturns.post("/", allow("purchases:write"), tx.createPurchaseReturn);
apiRouter.use("/purchase-returns", purchaseReturns);

// Payments & expenses
const payments = Router();
payments.get("/", allow("sales:read", "purchases:read", "expenses:read", "finance:read"), tx.listPayments);
payments.post("/", allow("sales:write", "purchases:write"), tx.createPayment);
apiRouter.use("/payments", payments);

apiRouter.use("/expenses", crudRouter({
  list: tx.listExpenses, get: tx.getExpense, create: tx.createExpense,
  update: tx.updateExpense, remove: tx.deleteExpense,
}, "expenses:read", "expenses:write"));

// Workforce modules carried over from the original app
apiRouter.use("/departments", crudRouter(hr.departments, "hr:read", "hr:write"));
apiRouter.use("/employees", crudRouter(hr.employees, "hr:read", "hr:write"));
apiRouter.use("/operations", crudRouter(hr.operations, "hr:read", "hr:write"));
apiRouter.use("/attendance", crudRouter(hr.attendance, "hr:read", "hr:write"));
apiRouter.use("/tasks", crudRouter(hr.tasks, "hr:read", "hr:write"));
