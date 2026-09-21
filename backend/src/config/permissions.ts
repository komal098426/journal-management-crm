export const ROLES = ["admin", "manager", "sales_staff", "inventory_staff"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard:read",
  "finance:read",
  "reports:read",
  "sales:read", "sales:write", "sales:cancel",
  "customers:read", "customers:write", "customers:delete",
  "purchases:read", "purchases:write", "purchases:cancel",
  "suppliers:read", "suppliers:write", "suppliers:delete",
  "inventory:read", "inventory:write", "inventory:delete",
  "expenses:read", "expenses:write",
  "hr:read", "hr:write",
  "users:manage", "settings:write",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const managerPermissions: Permission[] = [
  "dashboard:read", "finance:read", "reports:read",
  "sales:read", "sales:write", "sales:cancel",
  "customers:read", "customers:write", "customers:delete",
  "purchases:read", "purchases:write", "purchases:cancel",
  "suppliers:read", "suppliers:write", "suppliers:delete",
  "inventory:read", "inventory:write", "inventory:delete",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: PERMISSIONS,
  manager: managerPermissions,
  sales_staff: [
    "dashboard:read",
    "sales:read", "sales:write",
    "customers:read", "customers:write",
    "inventory:read",
  ],
  inventory_staff: [
    "dashboard:read",
    "purchases:read", "purchases:write",
    "suppliers:read", "suppliers:write",
    "inventory:read", "inventory:write",
  ],
};

export function can(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}
