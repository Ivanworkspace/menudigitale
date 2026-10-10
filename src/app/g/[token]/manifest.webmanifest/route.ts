import { NextResponse } from "next/server";
import { resolveTenantByToken } from "@/server/tenancy/resolve";

/** Per-venue PWA manifest: installs the staff panel on tablets/phones. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tenant = await resolveTenantByToken(token);
  if (!tenant) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json(
    {
      name: `${tenant.displayName} · Gestione`,
      short_name: tenant.displayName.slice(0, 12),
      start_url: `/g/${token}/staff`,
      scope: `/g/${token}/`,
      display: "standalone",
      orientation: "any",
      background_color: "#f8fafc",
      theme_color: "#0f172a",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}
