import { NextResponse } from "next/server";
import { getStaffContext } from "@/server/auth/staff-session";
import { exportTenant } from "@/server/export";
import { logTenantAction } from "@/server/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getStaffContext(token);
  if (!ctx || ctx.staff.role !== "owner") return new NextResponse("Solo il titolare può esportare i dati", { status: 403 });
  const data = await exportTenant(ctx.tenant.id);
  await logTenantAction(ctx.tenant.id, { kind: "staff", id: ctx.staff.id, name: ctx.staff.displayName, impersonatedBy: ctx.impersonatedBy }, "data.exported");
  return new NextResponse(JSON.stringify(data, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ctx.tenant.slug}-dati-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
