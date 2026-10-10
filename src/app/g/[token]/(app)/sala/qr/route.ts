import { NextResponse, type NextRequest } from "next/server";
import { getStaffContext } from "@/server/auth/staff-session";
import { refs, allWithId } from "@/server/db";
import { qrPdf, type QrLayout } from "@/server/qr";
import { publicEnv } from "@/lib/env";
import type { Room, Table } from "@/domain/orders";

/** Table QR codes as printable PDF: ?table=<id> or ?all=1, &layout=tent|sticker|poster */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getStaffContext(token);
  if (!ctx || !ctx.permissions.has("tables.manage")) return new NextResponse("Non autorizzato", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const layout = (["tent", "sticker", "poster"].includes(sp.get("layout") ?? "") ? sp.get("layout") : "tent") as QrLayout;
  const [tables, rooms] = await Promise.all([
    refs.tables(ctx.tenant.id).get().then(allWithId<Table>),
    refs.rooms(ctx.tenant.id).get().then(allWithId<Room>),
  ]);
  const roomOrder = new Map(rooms.map((r) => [r.id, r.sort]));
  const list = tables
    .filter((t) => t.active && (sp.get("all") ? true : t.id === sp.get("table")))
    .sort((a, b) => (roomOrder.get(a.roomId) ?? 0) - (roomOrder.get(b.roomId) ?? 0) || a.label.localeCompare(b.label, "it", { numeric: true }));
  if (!list.length) return new NextResponse("Nessun tavolo", { status: 404 });
  const bytes = await qrPdf({
    items: list.map((t) => ({
      title: `Tavolo ${t.label}`,
      subtitle: ctx.modules.orders ? "Inquadra per vedere il menu e ordinare" : "Inquadra per vedere il menu",
      url: `${publicEnv.appUrl}/m/${ctx.tenant.slug}/t/${t.qrToken}`,
    })),
    layout,
    venueName: ctx.tenant.displayName,
    primaryColor: ctx.tenant.branding.primaryColor,
    logoPath: ctx.tenant.branding.logoPath,
    footer: ctx.tenant.displayName,
  });
  const name = sp.get("all") ? "tutti" : list[0].label;
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="qr-tavoli-${name}-${layout}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
