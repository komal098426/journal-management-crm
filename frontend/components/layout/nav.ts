import {
  Activity, BarChart3, BookOpen, Building2, ClipboardCheck, Grid2X2, LayoutDashboard, ListChecks, ListTodo,
  Receipt, Settings2, ShoppingCart, Truck, Undo2, UserRound, Users,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/types/erp";

export type NavItem = {
  label: string;
  short?: string;
  href: string;
  icon: LucideIcon;
  /** Visible when the user holds any of these; omitted = everyone. */
  permissions?: Permission[];
  /** Shown in the top pill bar as well as the side rail. */
  pill?: boolean;
};

export const NAV: NavItem[] = [
  { label: "ERP Overview", short: "Overview", href: "/", icon: LayoutDashboard, permissions: ["dashboard:read"], pill: true },
  { label: "Sales", href: "/sales", icon: ShoppingCart, permissions: ["sales:read"], pill: true },
  { label: "Procurement", href: "/purchases", icon: ListTodo, permissions: ["purchases:read"], pill: true },
  { label: "Inventory", href: "/inventory", icon: Grid2X2, permissions: ["inventory:read"], pill: true },
  { label: "Customers", href: "/customers", icon: Users, permissions: ["customers:read"], pill: true },
  { label: "Suppliers", href: "/suppliers", icon: Truck, permissions: ["suppliers:read"], pill: true },
  { label: "Finance", href: "/payments", icon: BarChart3, permissions: ["sales:read", "purchases:read", "expenses:read", "finance:read"], pill: true },
  { label: "Expenses", href: "/expenses", icon: Receipt, permissions: ["expenses:read"] },
  { label: "Returns", href: "/returns", icon: Undo2, permissions: ["sales:read", "purchases:read"] },
  {
    label: "Reports & Analytics", short: "Reports", href: "/reports", icon: Activity, pill: true,
    permissions: ["sales:read", "purchases:read", "inventory:read", "customers:read", "suppliers:read", "finance:read"],
  },
  { label: "People", href: "/people", icon: UserRound, permissions: ["hr:read"] },
  { label: "Operations", href: "/operations", icon: BookOpen, permissions: ["hr:read"] },
  { label: "Attendance", href: "/attendance", icon: ClipboardCheck, permissions: ["hr:read"] },
  { label: "Tasks", href: "/tasks", icon: ListChecks, permissions: ["hr:read"] },
  { label: "Departments", href: "/departments", icon: Building2, permissions: ["hr:read"] },
  { label: "Settings", href: "/settings", icon: Settings2 },
];
