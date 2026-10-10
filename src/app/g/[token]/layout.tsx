import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveTenantByToken, tenantSubscription } from "@/server/tenancy/resolve";
import { getStaffContext } from "@/server/auth/staff-session";
import { ServiceWorkerRegister } from "@/components/staff/sw-register";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Gestione locale",
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: "no-referrer",
    manifest: `/g/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "Gestione", statusBarStyle: "black-translucent" },
    icons: { apple: "/icons/apple-touch-icon.png" },
  };
}

export default async function ManagementLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tenant = await resolveTenantByToken(token);
  if (!tenant) notFound();

  const sub = tenantSubscription(tenant);
  if (!sub.accessAllowed) {
    // Platform admins in an impersonation session can still get in.
    const ctx = await getStaffContext(token);
    if (!ctx) {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-slate-100 px-4">
          <div className="max-w-md rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold uppercase tracking-wider text-red-600">Servizio sospeso</p>
            <h1 className="mt-2 text-xl font-bold text-slate-900">{tenant.displayName}</h1>
            <p className="mt-3 text-sm text-slate-600">
              {sub.phase === "expired"
                ? "L'abbonamento è scaduto. Contatta l'assistenza per rinnovarlo e riattivare il pannello."
                : "L'accesso al pannello è temporaneamente sospeso. Contatta l'assistenza."}
            </p>
          </div>
        </main>
      );
    }
  }
  return (
    <>
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
