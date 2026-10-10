import "server-only";
import { notFound, redirect } from "next/navigation";
import { getStaffContext, type StaffContext } from "./staff-session";
import type { Permission } from "@/domain/permissions";
import type { ModuleKey } from "@/domain/modules";

export class ForbiddenError extends Error {
  constructor(message = "Non hai i permessi per questa operazione.") {
    super(message);
  }
}

/**
 * Page guard for /g/[token]/(app)/*: requires a valid staff session and,
 * optionally, an enabled module and a permission.
 */
export async function requireStaffPage(
  token: string,
  opts: { permission?: Permission; module?: ModuleKey } = {},
): Promise<StaffContext> {
  const ctx = await getStaffContext(token);
  if (!ctx) redirect(`/g/${token}`);
  if (opts.module && !ctx.modules[opts.module]) notFound();
  if (opts.permission && !ctx.permissions.has(opts.permission)) redirect(`/g/${token}/dashboard?negato=1`);
  return ctx;
}

/** Action guard: same checks, but throws instead of redirecting. */
export async function requireStaffAction(
  token: string,
  opts: { permission?: Permission; module?: ModuleKey } = {},
): Promise<StaffContext> {
  const ctx = await getStaffContext(token);
  if (!ctx) throw new ForbiddenError("Sessione scaduta: accedi di nuovo.");
  if (opts.module && !ctx.modules[opts.module]) throw new ForbiddenError("Modulo non attivo per questo locale.");
  if (opts.permission && !ctx.permissions.has(opts.permission)) throw new ForbiddenError();
  return ctx;
}

export function staffActor(ctx: StaffContext) {
  return { kind: "staff" as const, id: ctx.staff.id, name: ctx.staff.displayName, impersonatedBy: ctx.impersonatedBy };
}
