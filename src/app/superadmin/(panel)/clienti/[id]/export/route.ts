import { NextResponse } from "next/server";
import { getAdminSession } from "@/server/auth/platform-admin";
import { exportTenant } from "@/server/export";
import { logPlatformAction } from "@/server/audit";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getAdminSession();
  if (!s?.data.mfa) return new NextResponse("Non autorizzato", { status: 401 });
  const { id } = await params;
  const data = await exportTenant(id);
  await logPlatformAction(s.data.uid, "tenant.exported", id);
  return new NextResponse(JSON.stringify(data, null, 1), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="tenant-${id}.json"`, "Cache-Control": "no-store" },
  });
}
