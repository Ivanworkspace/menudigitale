/**
 * Single source of truth for Firestore collection paths (shared by server,
 * scripts and security-rule tests).
 *
 * Top level (server-only unless noted):
 *   platform_admins/{uid}            super admins (+ encrypted TOTP secret)
 *   admin_sessions/{tokenHash}       super admin sessions
 *   plans/{planId}
 *   platform/settings
 *   platform_audit_log/{id}
 *   impersonation_sessions/{id}
 *   slugs/{slug}                     -> { tenantId } (uniqueness)
 *   access_tokens/{tokenHash}        -> { tenantId, tokenEnc, hint }
 *   staff_credentials/{staffId}      -> { tenantId, pinHash }
 *   staff_sessions/{tokenHash}
 *   auth_attempts/{id}
 *   tenants/{tenantId}               (staff of the tenant: read)
 *     staff/{staffId}                (staff: read)
 *     role_permissions/{role}
 *     audit_log/{id}
 *     subscription_events/{id}
 *     menu_mode_schedules/{id}
 *     … (menu, tables, orders: later phases)
 */
export const COL = {
  platformAdmins: "platform_admins",
  adminSessions: "admin_sessions",
  plans: "plans",
  platform: "platform",
  platformAudit: "platform_audit_log",
  impersonations: "impersonation_sessions",
  slugs: "slugs",
  accessTokens: "access_tokens",
  staffCredentials: "staff_credentials",
  staffSessions: "staff_sessions",
  authAttempts: "auth_attempts",
  tenants: "tenants",
  tableTokens: "table_tokens",
  printKeys: "print_keys",
} as const;

export const SUB = {
  staff: "staff",
  rolePermissions: "role_permissions",
  audit: "audit_log",
  subscriptionEvents: "subscription_events",
  menuModeSchedules: "menu_mode_schedules",
  menus: "menus",
  categories: "categories",
  products: "products",
  modifierGroups: "modifier_groups",
  departments: "departments",
  rooms: "rooms",
  tables: "tables",
  tableSessions: "table_sessions",
  orders: "orders",
  serviceRequests: "service_requests",
  notifications: "notifications",
  orderBlocks: "order_blocks",
  printers: "printers",
  printJobs: "print_jobs",
  staffMessages: "staff_messages",
  bills: "bills",
  counters: "counters",
  analytics: "analytics",
  reservations: "reservations",
  customers: "customers",
  loyaltyTransactions: "loyalty_transactions",
  promotions: "promotions",
  ingredients: "ingredients",
  stockMovements: "stock_movements",
} as const;
