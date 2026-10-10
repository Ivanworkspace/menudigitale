import "server-only";
import { refs, nowIso } from "@/server/db";
import { clientIp } from "@/server/request";

export type TenantActor =
  | { kind: "staff"; id: string; name: string; impersonatedBy?: string | null }
  | { kind: "platform_admin"; id: string; name?: string }
  | { kind: "guest" | "system"; id?: null; name?: string };

/** Append-only tenant activity log (who, what, when). Never throws. */
export async function logTenantAction(
  tenantId: string,
  actor: TenantActor,
  action: string,
  details: { entity?: string; entityId?: string; diff?: unknown } = {},
) {
  try {
    const name = actor.kind === "staff" && actor.impersonatedBy ? `${actor.name} (assistenza)` : (actor.name ?? null);
    await refs.audit(tenantId).add({
      actorKind: actor.kind,
      actorId: actor.id ?? null,
      actorName: name,
      action,
      entity: details.entity ?? null,
      entityId: details.entityId ?? null,
      diff: details.diff ?? null,
      ip: await clientIp(),
      createdAt: nowIso(),
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}

export async function logPlatformAction(
  adminId: string,
  action: string,
  tenantId: string | null,
  payload: Record<string, unknown> = {},
) {
  try {
    await refs.platformAudit().add({ adminId, action, tenantId, payload, ip: await clientIp(), createdAt: nowIso() });
  } catch (e) {
    console.error("platform audit log failed", e);
  }
}
