import { NextResponse, type NextRequest } from "next/server";
import { getStaffContext } from "@/server/auth/staff-session";
import { qrPdf, qrPng, qrSvg, type QrLayout } from "@/server/qr";
import { publicEnv } from "@/lib/env";

/** General menu QR: ?format=png|svg|pdf&layout=tent|sticker|poster */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getStaffContext(token);
  if (!ctx) return new NextResponse("Non autorizzato", { status: 401 });
  const url = `${publicEnv.appUrl}/m/${ctx.tenant.slug}`;
  const format = req.nextUrl.searchParams.get("format") ?? "png";
  const name = `qr-menu-${ctx.tenant.slug}`;
  if (format === "svg") {
    return new NextResponse(await qrSvg(url), {
      headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="${name}.svg"` },
    });
  }
  if (format === "pdf") {
    const layout = (["tent", "sticker", "poster"].includes(req.nextUrl.searchParams.get("layout") ?? "")
      ? req.nextUrl.searchParams.get("layout")
      : "poster") as QrLayout;
    const copies = layout === "sticker" ? 12 : 1;
    const bytes = await qrPdf({
      items: Array.from({ length: copies }, () => ({ title: ctx.tenant.displayName, subtitle: "Inquadra per il menu", url })),
      layout,
      venueName: ctx.tenant.displayName,
      primaryColor: ctx.tenant.branding.primaryColor,
      logoPath: ctx.tenant.branding.logoPath,
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}-${layout}.pdf"` },
    });
  }
  return new NextResponse(new Uint8Array(await qrPng(url)), {
    headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${name}.png"` },
  });
}
