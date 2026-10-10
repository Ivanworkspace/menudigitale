"use server";

import { staffAction, UserError } from "@/server/action";
import { setItemsStatus } from "@/server/orders/kitchen";
import { notify } from "@/server/notify";
import { refs, withId } from "@/server/db";
import { getTenant } from "@/server/tenancy/resolve";
import { printOrderItems } from "@/server/printing";
import type { ItemStatus, Order } from "@/domain/orders";

const STATUSES: ItemStatus[] = ["new", "in_progress", "ready", "served"];

export async function setStatus(token: string, orderId: string, itemIds: string[] | "all", status: ItemStatus, departmentId?: string | null) {
  // Kitchen marks progress; waiters mark "served".
  const permission = status === "served" ? ("orders.create" as const) : ("kds.view" as const);
  return staffAction(token, { permission, module: status === "served" ? "orders" : "kds" }, async (ctx) => {
    if (!STATUSES.includes(status)) throw new UserError("Stato non valido.");
    await setItemsStatus(ctx.tenant.id, orderId, itemIds, status, departmentId);
  });
}

export async function sendKitchenMessage(token: string, text: string, tableLabel?: string) {
  return staffAction(token, { module: "kds" }, async (ctx) => {
    const t = text.trim().slice(0, 140);
    if (!t) throw new UserError("Messaggio vuoto.");
    await notify(ctx.tenant.id, {
      type: "message",
      title: `${ctx.staff.displayName}${tableLabel ? ` · Tavolo ${tableLabel}` : ""}: ${t}`,
      urgent: true,
    });
  });
}

export async function reprint(token: string, orderId: string, departmentId: string | null) {
  return staffAction(token, { permission: "kds.view", module: "kds" }, async (ctx) => {
    const o = withId<Order>(await refs.orders(ctx.tenant.id).doc(orderId).get());
    if (!o) throw new UserError("Comanda non trovata.");
    const tenant = await getTenant(ctx.tenant.id);
    const items = o.items.filter((i) => i.status !== "cancelled" && i.status !== "held" && (!departmentId || i.departmentId === departmentId));
    await printOrderItems(tenant!, o, items, { reprint: true });
  });
}
