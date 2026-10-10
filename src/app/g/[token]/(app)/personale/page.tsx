import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import { loadPermissions } from "@/server/auth/staff-session";
import { STAFF_ROLES, type StaffRole } from "@/domain/permissions";
import type { StaffMember } from "@/server/db/types";
import { StaffEditor } from "./staff-editor";

export const metadata = { title: "Personale" };

export default async function StaffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "staff.manage" });
  const [staff, plan] = await Promise.all([
    refs.staff(ctx.tenant.id).get().then(allWithId<StaffMember>),
    ctx.tenant.planId ? refs.plans().doc(ctx.tenant.planId).get() : null,
  ]);
  const perms: Record<string, string[]> = {};
  for (const r of STAFF_ROLES) perms[r] = [...(await loadPermissions(ctx.tenant.id, r as StaffRole))];
  return (
    <StaffEditor
      token={token}
      staff={staff.sort((a, b) => Number(b.active) - Number(a.active) || a.sort - b.sort)}
      maxStaff={(plan?.get("maxStaff") as number | null | undefined) ?? null}
      isOwner={ctx.staff.role === "owner"}
      permissions={perms}
    />
  );
}
