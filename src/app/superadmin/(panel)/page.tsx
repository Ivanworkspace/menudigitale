import Link from "next/link";
import { listTenants } from "@/server/superadmin/queries";
import { refs, allWithId } from "@/server/db";
import type { PlatformAuditEntry } from "@/server/db/types";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PhaseBadge } from "@/components/superadmin/status-badge";
import { formatDate, formatDateTime, formatEuro } from "@/lib/format";

export const metadata = { title: "Panoramica" };

export default async function AdminDashboard() {
  const [tenants, log] = await Promise.all([
    listTenants(),
    refs.platformAudit().orderBy("createdAt", "desc").limit(8).get().then(allWithId<PlatformAuditEntry>),
  ]);

  const operating = tenants.filter((t) => t.sub.accessAllowed);
  const paying = tenants.filter((t) => t.sub.phase === "active" || t.sub.phase === "grace");
  const mrr = paying.reduce((s, t) => s + (t.priceMonthCents ?? 0), 0);
  const expiring = tenants
    .filter((t) => t.sub.accessAllowed && t.sub.daysLeft !== null && t.sub.daysLeft <= 14)
    .sort((a, b) => (a.sub.daysLeft ?? 0) - (b.sub.daysLeft ?? 0));
  const ordersTotal = tenants.reduce((s, t) => s + t.ordersThisMonth, 0);
  const names = new Map(tenants.map((t) => [t.id, t.displayName]));

  return (
    <>
      <PageHeader
        title="Panoramica"
        description="Stato della piattaforma e dei clienti"
        action={
          <Link href="/superadmin/clienti/nuovo" className={buttonClass()}>
            <Icon name="plus" className="h-4 w-4" /> Nuovo cliente
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Clienti operativi" value={operating.length} hint={`${tenants.length} in totale`} />
        <Stat label="In prova" value={tenants.filter((t) => t.sub.phase === "trial").length} />
        <Stat label="Entrate mensili ricorrenti" value={formatEuro(mrr)} hint={`${paying.length} abbonamenti attivi`} />
        <Stat label="Ordini del mese" value={ordersTotal} hint="Tutti i locali" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="In scadenza" description="Prossimi 14 giorni e periodo di tolleranza" />
          {expiring.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Nessun cliente in scadenza.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {expiring.map((t) => (
                <li key={t.id}>
                  <Link href={`/superadmin/clienti/${t.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{t.displayName}</p>
                      <p className="text-xs text-slate-500">Scade il {formatDate(t.sub.endsAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm tabular-nums text-slate-600">
                        {t.sub.daysLeft! >= 0 ? `${t.sub.daysLeft} gg` : `scaduto da ${-t.sub.daysLeft!} gg`}
                      </span>
                      <PhaseBadge phase={t.sub.phase} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Attività recente" action={<Link href="/superadmin/log" className="text-sm text-slate-600 hover:underline">Tutto</Link>} />
          <ul className="divide-y divide-slate-100">
            {log.map((e) => (
              <li key={e.id} className="px-5 py-2.5 text-sm">
                <p className="font-medium text-slate-800">{e.action}</p>
                <p className="text-xs text-slate-500">
                  {e.tenantId ? `${names.get(e.tenantId) ?? "—"} · ` : ""}
                  {formatDateTime(e.createdAt)}
                </p>
              </li>
            ))}
            {!log.length && <li className="px-5 py-8 text-center text-sm text-slate-500">Nessuna attività.</li>}
          </ul>
        </Card>
      </div>
    </>
  );
}
