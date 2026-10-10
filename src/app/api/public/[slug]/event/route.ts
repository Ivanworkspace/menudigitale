import { NextResponse, type NextRequest } from "next/server";
import { refs, FieldValue } from "@/server/db";

/**
 * Anonymous, aggregated menu analytics (no personal data, no cookies):
 * daily counters of menu views, QR scans and product views.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return new NextResponse(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { type?: string; productId?: string } | null;
  const type = body?.type;
  if (type !== "menu_view" && type !== "qr_scan" && type !== "product_view") return new NextResponse(null, { status: 204 });
  const s = await refs.slugs().doc(slug).get();
  if (!s.exists) return new NextResponse(null, { status: 204 });
  const tenantId = s.get("tenantId") as string;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const patch: Record<string, unknown> = { day };
  if (type === "menu_view") patch.menuViews = FieldValue.increment(1);
  if (type === "qr_scan") patch.qrScans = FieldValue.increment(1);
  if (type === "product_view" && body?.productId && /^[A-Za-z0-9]{10,40}$/.test(body.productId)) {
    patch.productViews = { [body.productId]: FieldValue.increment(1) };
  }
  await refs.analytics(tenantId).doc(day).set(patch, { merge: true });
  return new NextResponse(null, { status: 204 });
}
