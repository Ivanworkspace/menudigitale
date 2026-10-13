"use server";

import { staffAction } from "@/server/action";
import { staffActor } from "@/server/auth/require-staff";
import { logTenantAction } from "@/server/audit";
import { setTakeawayStatus } from "@/server/takeaway";
import type { TakeawayStatus } from "@/domain/takeaway";

export async function moveTakeaway(token: string, sessionId: string, to: Exclude<TakeawayStatus, "pending" | "picked_up">, reason?: string) {
  return staffAction(token, { permission: "orders.approve", module: "takeaway" }, async (ctx) => {
    await setTakeawayStatus(ctx.tenant, sessionId, to, { id: ctx.staff.id, name: ctx.staff.displayName }, reason);
    await logTenantAction(ctx.tenant.id, staffActor(ctx), `takeaway.${to}`, { entity: "table_session", entityId: sessionId, diff: reason ? { reason } : null });
  });
}
