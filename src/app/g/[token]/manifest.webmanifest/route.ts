import { NextResponse } from "next/server";
import { resolveTenantByToken } from "@/server/tenancy/resolve";

/** Per-venue PWA manifest: installs the staff panel on tablets/phones. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const tenant = await resolveTenantByToken(token);
  if (!tenant) return new NextResponse("Not found", { status: 404 });
  // ?app=titolare: the owner app (opens on the owner dashboard after the PIN).
  const owner = new URL(req.url).searchParams.get("app") === "titolare";
  return NextResponse.json(
    {
      id: owner ? `/g/${token}/titolare` : `/g/${token}/staff`,
      name: owner ? `${tenant.displayName} · Titolare` : `${tenant.displayName} · Gestione`,
      short_name: owner ? "Titolare" : tenant.displayName.slice(0, 12),
      start_url: owner ? `/g/${token}?app=titolare` : `/g/${token}/staff`,
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
