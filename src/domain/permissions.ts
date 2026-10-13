import type { ModuleKey, ModuleFlags } from "./modules";

export const STAFF_ROLES = ["owner", "manager", "waiter", "kitchen", "bar", "cashier"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  owner: "Titolare",
  manager: "Responsabile di sala",
  waiter: "Cameriere",
  kitchen: "Cucina",
  bar: "Bar",
  cashier: "Cassa",
};

export const PERMISSIONS = {
  "tables.manage": "Aprire, chiudere e spostare tavoli",
  "orders.create": "Inserire ordini",
  "orders.cancel": "Annullare prodotti e comande",
  "orders.approve": "Approvare ordini dal QR",
  "kds.view": "Vedere lo schermo cucina/bar",
  "products.availability": "Segnare prodotti esauriti",
  "menu.edit": "Modificare il menu e i prezzi",
  "bills.manage": "Gestire conti e incassare",
  "discounts.apply": "Applicare sconti e maggiorazioni",
  "revenue.view": "Vedere incassi e statistiche",
  "staff.manage": "Gestire il personale",
  "settings.manage": "Modificare le impostazioni del locale",
  "reservations.manage": "Gestire le prenotazioni",
  "customers.manage": "Gestire clienti e fidelity",
  "inventory.manage": "Gestire il magazzino",
  "audit.view": "Vedere il registro attività",
} as const;
export type Permission = keyof typeof PERMISSIONS;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLE_PERMISSIONS: Record<StaffRole, Permission[]> = {
  owner: ALL,
  manager: ALL.filter((p) => p !== "settings.manage"),
  waiter: ["tables.manage", "orders.create", "orders.approve", "products.availability", "reservations.manage"],
  kitchen: ["kds.view", "products.availability"],
  bar: ["kds.view", "products.availability", "orders.create"],
  cashier: ["tables.manage", "orders.create", "bills.manage", "discounts.apply", "reservations.manage", "customers.manage"],
};

export type PermissionOverride = { role: StaffRole; permission: string; allowed: boolean };

/** Effective permissions = role defaults + tenant overrides. Owner keeps all. */
export function resolvePermissions(role: StaffRole, overrides: PermissionOverride[] = []): Set<Permission> {
  const set = new Set<Permission>(DEFAULT_ROLE_PERMISSIONS[role]);
  if (role === "owner") return set;
  for (const o of overrides) {
    if (o.role !== role || !(o.permission in PERMISSIONS)) continue;
    if (o.allowed) set.add(o.permission as Permission);
    else set.delete(o.permission as Permission);
  }
  return set;
}

export type NavItem = {
  href: string; // relative to /g/[token]
  label: string;
  icon: string;
  module?: ModuleKey;
  permission?: Permission;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "dashboard", label: "Panoramica", icon: "home" },
  { href: "titolare", label: "App titolare", icon: "phone", permission: "revenue.view" },
  { href: "sala", label: "Sala e tavoli", icon: "grid", permission: "tables.manage" },
  { href: "ordini", label: "Ordini", icon: "receipt", module: "orders", permission: "orders.create" },
  { href: "asporto", label: "Asporto", icon: "bag", module: "takeaway", permission: "orders.approve" },
  { href: "cucina", label: "Cucina e bar", icon: "flame", module: "kds", permission: "kds.view" },
  { href: "conti", label: "Conti e cassa", icon: "wallet", module: "billing", permission: "bills.manage" },
  { href: "menu", label: "Menu", icon: "book", permission: "menu.edit" },
  { href: "disponibilita", label: "Disponibilità", icon: "check", permission: "products.availability" },
  { href: "prenotazioni", label: "Prenotazioni", icon: "calendar", module: "reservations", permission: "reservations.manage" },
  { href: "clienti", label: "Clienti e fidelity", icon: "heart", module: "loyalty", permission: "customers.manage" },
  { href: "magazzino", label: "Magazzino", icon: "box", module: "inventory", permission: "inventory.manage" },
  { href: "statistiche", label: "Statistiche", icon: "chart", permission: "revenue.view" },
  { href: "personale", label: "Personale", icon: "users", permission: "staff.manage" },
  { href: "registro", label: "Registro attività", icon: "list", permission: "audit.view" },
  { href: "impostazioni", label: "Impostazioni", icon: "settings", permission: "settings.manage" },
];

export function visibleNav(perms: Set<Permission>, modules: ModuleFlags): NavItem[] {
  return NAV_ITEMS.filter((i) => (!i.module || modules[i.module]) && (!i.permission || perms.has(i.permission)));
}
