import "server-only";
import { ForbiddenError, requireStaffAction } from "@/server/auth/require-staff";
import type { StaffContext } from "@/server/auth/staff-session";
import type { Permission } from "@/domain/permissions";
import type { ModuleKey } from "@/domain/modules";
import { SelectionError } from "@/domain/menu";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Errors whose message is safe to show to the user. */
export class UserError extends Error {}

/**
 * Wraps a staff server action: authorization (session, module, permission)
 * plus uniform error handling. Unexpected errors are logged, not leaked.
 */
export async function staffAction<T>(
  token: string,
  opts: { permission?: Permission; module?: ModuleKey },
  fn: (ctx: StaffContext) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const ctx = await requireStaffAction(token, opts);
    return { ok: true, data: await fn(ctx) };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UserError || e instanceof SelectionError) {
      return { ok: false, error: (e as Error).message };
    }
    // Let Next.js redirects/notFound propagate.
    if ((e as { digest?: string }).digest?.startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, error: "Si è verificato un errore. Riprova." };
  }
}
