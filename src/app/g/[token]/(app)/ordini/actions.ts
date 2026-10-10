"use server";

import { staffAction, UserError } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { approveOrder, cancelItem, createOrder, sendNextCourse, type LineInput } from "@/server/orders/service";
import { getSession } from "@/server/sala/service";

export async function sendWaiterOrder(token: string, sessionId: string, input: { lines: LineInput[]; notes?: string; urgent?: boolean }) {
  return staffAction(token, { permission: "orders.create", module: "orders" }, async (ctx) => {
    const s = await getSession(ctx.tenant.id, sessionId);
    if (s.status === "closed") throw new UserError("Il tavolo è chiuso.");
    const r = await createOrder(ctx.tenant, sessionId, input.lines, {
      source: "waiter",
      actor: { id: ctx.staff.id, name: ctx.staff.displayName },
      notes: input.notes,
      urgent: input.urgent,
    });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "order.created", { entity: "order", entityId: r.orderId, diff: { table: s.tableLabel, lines: input.lines.length } });
    return r;
  });
}

export async function approve(token: string, orderId: string, ok: boolean) {
  return staffAction(token, { permission: "orders.approve", module: "orders" }, async (ctx) => {
    await approveOrder(ctx.tenant.id, orderId, { id: ctx.staff.id, name: ctx.staff.displayName }, ok);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), ok ? "order.approved" : "order.rejected", { entity: "order", entityId: orderId });
  });
}

export async function cancelOrderItem(token: string, orderId: string, itemId: string, reason: string) {
  return staffAction(token, { permission: "orders.cancel", module: "orders" }, async (ctx) => {
    await cancelItem(ctx.tenant.id, orderId, itemId, reason, { id: ctx.staff.id, name: ctx.staff.displayName });
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "order.item_cancelled", { entity: "order", entityId: orderId, diff: { itemId, reason } });
  });
}

export async function nextCourse(token: string, sessionId: string) {
  return staffAction(token, { permission: "orders.create", module: "orders" }, async (ctx) => {
    const course = await sendNextCourse(ctx.tenant.id, sessionId);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), "order.next_course", { entity: "table_session", entityId: sessionId, diff: { course } });
    return { course };
  });
}
