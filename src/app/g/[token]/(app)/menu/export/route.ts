import { NextResponse } from "next/server";
import { getStaffContext } from "@/server/auth/staff-session";
import { loadMenuData } from "@/server/menu/repo";
import { exportProductsCsv } from "@/domain/menu-csv";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getStaffContext(token);
  if (!ctx || !ctx.permissions.has("menu.edit")) return new NextResponse("Non autorizzato", { status: 401 });
  const data = await loadMenuData(ctx.tenant.id);
  const cat = new Map(data.categories.map((c) => [c.id, c.name.it ?? ""]));
  const dep = new Map(data.departments.map((d) => [d.id, d.name]));
  const csv = exportProductsCsv(
    data.products,
    (id) => cat.get(id) ?? "",
    (id) => (id ? (dep.get(id) ?? "") : ""),
    ctx.tenant.settings.languages,
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="menu-${ctx.tenant.slug}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
