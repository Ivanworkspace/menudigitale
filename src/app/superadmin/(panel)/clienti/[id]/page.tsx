import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/server/auth/platform-admin";
import { refs, allWithId } from "@/server/db";
import { listPlans } from "@/server/superadmin/queries";
import { getTenant, tenantSubscription } from "@/server/tenancy/resolve";
import type { PlatformAuditEntry, SubscriptionEvent } from "@/server/db/types";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PhaseBadge } from "@/components/superadmin/status-badge";
import { assetUrl } from "@/lib/assets";
import { formatDate, formatDateTime, formatEuro, formatRelative } from "@/lib/format";
import { AccessPanel, BrandingPanel, DetailsPanel, ModulesPanel, SubscriptionPanel } from "./panels";

export const metadata = { title: "Scheda cliente" };

const EVENT_LABELS: Record<string, string> = {
  created: "Creato",
  renewed: "Rinnovato",
  plan_changed: "Cambio piano",
  suspended: "Sospeso",
  reactivated: "Riattivato",
  expired: "Scaduto",
  grace_started: "Inizio tolleranza",
  warning_sent: "Avviso scadenza",
};

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformAdmin();
  const tenant = await getTenant(id);
  if (!tenant) notFound();

  const [plans, tokenSnap, events, staffCount, log] = await Promise.all([
    listPlans(),
    refs.accessTokens().where("tenantId", "==", id).limit(1).get(),
    refs.subscriptionEvents(id).orderBy("createdAt", "desc").limit(20).get().then(allWithId<SubscriptionEvent>),
    refs.staff(id).where("active", "==", true).count().get().then((s) => s.data().count),
    refs.platformAudit().where("tenantId", "==", id).orderBy("createdAt", "desc").limit(15).get().then(allWithId<PlatformAuditEntry>),
  ]);
  const token = tokenSnap.docs[0];

  const sub = tenantSubscription(tenant);
  const plan = plans.find((p) => p.id === tenant.planId);
  const nextEnd = new Date(Math.max(Date.now(), sub.endsAt?.getTime() ?? 0));
  nextEnd.setMonth(nextEnd.getMonth() + 1);

  return (
    <>
      <PageHeader
        title={tenant.displayName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <PhaseBadge phase={sub.phase} /> {tenant.legalName}
            {tenant.suspendedReason && sub.phase === "suspended" && <span className="text-red-600">· {tenant.suspendedReason}</span>}
          </span>
        }
        action={
          <div className="flex gap-2">
            <a href={`/superadmin/clienti/${id}/export`} className={buttonClass("secondary")}>Esporta dati</a>
            <Link href={`/m/${tenant.slug}`} target="_blank" className={buttonClass("secondary")}>
              <Icon name="external" className="h-4 w-4" /> Menu pubblico
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Piano" value={plan?.name ?? "—"} hint={plan ? `${formatEuro(plan.priceMonthCents)}/mese` : undefined} />
        <Stat
          label="Scadenza"
          value={formatDate(sub.endsAt)}
          hint={sub.daysLeft === null ? "Nessuna scadenza" : sub.daysLeft >= 0 ? `tra ${sub.daysLeft} giorni` : `scaduto da ${-sub.daysLeft} giorni`}
        />
        <Stat label="Utenti attivi" value={staffCount} hint={plan?.maxStaff ? `max ${plan.maxStaff}` : "illimitati"} />
        <Stat label="Ultimo accesso" value={formatRelative(tenant.lastActivityAt)} hint={`Creato il ${formatDate(tenant.createdAt)}`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <AccessPanel tenantId={id} tokenHint={token?.get("hint") ?? "????"} rotatedAt={formatDate(token?.get("rotatedAt"))} />
        <SubscriptionPanel
          tenantId={id}
          status={tenant.status}
          defaultEnd={nextEnd.toISOString().slice(0, 10)}
          planPrice={plan?.priceMonthCents ?? null}
        />
      </div>

      <div className="mt-6">
        <ModulesPanel tenantId={id} modules={tenant.modules} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <DetailsPanel tenant={tenant} plans={plans} />
        </div>
        <div className="space-y-6">
          <BrandingPanel tenantId={id} branding={tenant.branding} logoUrl={assetUrl(tenant.branding.logoPath)} />
          <Card>
            <CardHeader title="Storico abbonamento" />
            <ul className="divide-y divide-slate-100 text-sm">
              {events.map((e) => (
                <li key={e.id} className="px-5 py-2.5">
                  <div className="flex justify-between">
                    <span className="font-medium text-slate-800">{EVENT_LABELS[e.type] ?? e.type}</span>
                    {e.amountCents != null && <span className="tabular-nums text-slate-600">{formatEuro(e.amountCents)}</span>}
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatDateTime(e.createdAt)}
                    {e.periodEnd && ` · fino al ${formatDate(e.periodEnd)}`}
                    {e.note && ` · ${e.note}`}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Registro" />
            <ul className="divide-y divide-slate-100 text-sm">
              {log.map((e) => (
                <li key={e.id} className="flex justify-between px-5 py-2">
                  <span className="text-slate-700">{e.action}</span>
                  <span className="text-xs text-slate-500">{formatDateTime(e.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
