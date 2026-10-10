import "server-only";
import { refs } from "@/server/db";

const SUBCOLLECTIONS = [
  "staff", "role_permissions", "menus", "categories", "products", "modifier_groups", "departments", "rooms", "tables",
  "table_sessions", "orders", "service_requests", "bills", "customers", "loyalty_transactions", "promotions",
  "reservations", "ingredients", "stock_movements", "printers", "subscription_events", "audit_log", "analytics",
];

/**
 * Full export of one venue's data (JSON). Secrets (access token, PIN hashes,
 * sessions, print keys) are never included.
 */
export async function exportTenant(tenantId: string) {
  const t = await refs.tenant(tenantId).get();
  const out: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    format: "menusaas-export/1",
    tenant: { id: t.id, ...t.data(), printing: undefined },
  };
  for (const name of SUBCOLLECTIONS) {
    const snap = await refs.tenant(tenantId).collection(name).get();
    out[name] = snap.docs.map((d) => {
      const data = d.data();
      delete data.expireAt;
      return { id: d.id, ...data };
    });
  }
  return out;
}
