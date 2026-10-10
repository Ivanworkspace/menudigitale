import { NextResponse } from "next/server";
import { refs } from "@/server/db";

/** Lightweight version check polled by open public menus. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return NextResponse.json({ version: null }, { status: 404 });
  const s = await refs.slugs().doc(slug).get();
  if (!s.exists) return NextResponse.json({ version: null }, { status: 404 });
  const t = await refs.tenant(s.get("tenantId")).get();
  return NextResponse.json(
    { version: (t.get("menuVersion") as string | undefined) ?? null },
    { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20" } },
  );
}
