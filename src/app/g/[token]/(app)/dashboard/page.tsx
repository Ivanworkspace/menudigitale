import Link from "next/link";
import { requireStaffPage } from "@/server/auth/require-staff";
import { tenantSubscription } from "@/server/tenancy/resolve";
import { visibleNav, ROLE_LABELS } from "@/domain/permissions";
import { MODULE_KEYS, MODULE_LABELS, MENU_MODE_LABELS } from "@/domain/modules";
import { PHASE_LABELS } from "@/domain/subscription";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { CopyButton } from "@/components/ui/copy-button";
import { formatDate } from "@/lib/format";
import { publicEnv } from "@/lib/env";
import { refs, allWithId } from "@/server/db";
import { Stat } from "@/components/ui/card";
import { formatEuro as eur } from "@/lib/format";
import { stockLevel, type Ingredient } from "@/domain/inventory";

export const metadata = { title: "Panoramica" };

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ negato?: string }>;
}) {
  const { token } = await params;
  const { negato } = await searchParams;
  const ctx = await requireStaffPage(token);
  const nav = visibleNav(ctx.permissions, ctx.modules).filter((n) => n.href !== "dashboard");
  const sub = tenantSubscription(ctx.tenant);
  const isManager = ctx.staff.role === "owner" || ctx.staff.role === "manager";
  const menuUrl = `${publicEnv.appUrl}/m/${ctx.tenant.slug}`;
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.tenant.settings.timezone }).format(new Date());
  const t = ctx.tenant.id;
  const [bills, openTables, reservations, ingredients] = await Promise.all([
    ctx.permissions.has("revenue.view") && ctx.modules.billing ? refs.bills(t).where("businessDay", "==", day).get() : null,
    refs.tableSessions(t).where("status", "in", ["open", "bill_requested"]).count().get(),
    ctx.modules.reservations ? refs.reservations(t).where("date", "==", day).get() : null,
    ctx.modules.inventory && ctx.permissions.has("inventory.manage") ? refs.ingredients(t).get().then(allWithId<Ingredient>) : null,
  ]);
  const paid = bills?.docs.filter((d) => d.get("status") === "paid") ?? [];
  const revenue = paid.reduce((s, d) => s + (d.get("totals.totalCents") as number), 0);
  const resActive = reservations?.docs.filter((d) => !["cancelled", "no_show"].includes(d.get("status"))) ?? [];
  const low = ingredients?.filter((i) => i.active && stockLevel(i) !== "ok") ?? [];
  // Onboarding checklist for the owner until the venue is set up.
  const [productsCount, tablesCount, staffCount] = await Promise.all([
    refs.products(t).count().get().then((x) => x.data().count),
    refs.tables(t).count().get().then((x) => x.data().count),
    refs.staff(t).count().get().then((x) => x.data().count),
  ]);
  const steps = [
    { done: productsCount > 0, label: "Crea categorie e prodotti del menu", href: "menu" },
    { done: !!ctx.tenant.settings.openingHours?.length, label: "Imposta orari, coperto e lingue", href: "impostazioni" },
    { done: tablesCount > 0, label: "Disegna la sala e aggiungi i tavoli", href: "sala" },
    { done: staffCount > 1, label: "Crea gli utenti del personale con i loro PIN", href: "personale" },
    { done: !!ctx.tenant.settings.privacyText, label: "Inserisci l'informativa privacy", href: "impostazioni/legali" },
  ];
  const showSteps = ctx.staff.role === "owner" && steps.some((x) => !x.done);

  return (
    <>
      <PageHeader title={`Ciao ${ctx.staff.displayName}`} description={`${ROLE_LABELS[ctx.staff.role]} · ${ctx.tenant.displayName}`} />
      {negato && (
        <div className="mb-4">
          <Alert tone="warning">Non hai i permessi per accedere a quella sezione.</Alert>
        </div>
      )}
      {showSteps && (
        <Card className="mb-6">
          <CardHeader title="Primi passi" description={`${steps.filter((x) => x.done).length} di ${steps.length} completati`} />
          <ul className="divide-y divide-slate-100">
            {steps.map((x) => (
              <li key={x.href}>
                <Link href={`/g/${token}/${x.href}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-slate-50">
                  <span className={x.done ? "text-emerald-600" : "text-slate-300"}>{x.done ? "✓" : "○"}</span>
                  <span className={x.done ? "text-slate-400 line-through" : "font-medium"}>{x.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {bills && <Stat label="Incasso di oggi" value={eur(revenue)} hint={`${paid.length} conti chiusi`} />}
        <Stat label="Tavoli aperti" value={openTables.data().count} />
        {reservations && <Stat label="Prenotazioni oggi" value={resActive.length} hint={`${resActive.reduce((s, d) => s + (d.get("covers") as number), 0)} coperti`} />}
        {ingredients && <Stat label="Scorte sotto soglia" value={low.length} hint={low.slice(0, 3).map((i) => i.name).join(", ") || "Tutto ok"} />}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={`/g/${token}/${n.href}`}
            className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-400"
          >
            <Icon name={n.icon} className="h-6 w-6 text-slate-700" />
            <span className="text-sm font-medium text-slate-900">{n.label}</span>
          </Link>
        ))}
      </div>

      {isManager && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Il tuo menu pubblico" description={MENU_MODE_LABELS[ctx.tenant.defaultMenuMode]} />
            <div className="flex flex-wrap items-center gap-2 p-5">
              <code className="flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">{menuUrl}</code>
              <CopyButton value={menuUrl} />
              <Link href={`/m/${ctx.tenant.slug}`} target="_blank" className="text-sm font-medium text-slate-700 hover:underline">
                Apri ↗
              </Link>
            </div>
          </Card>
          <Card>
            <CardHeader title="Abbonamento" />
            <div className="space-y-3 p-5 text-sm">
              <p>
                Stato: <strong>{PHASE_LABELS[sub.phase]}</strong>
                {sub.endsAt && <> · scadenza {formatDate(sub.endsAt)}</>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MODULE_KEYS.map((m) => (
                  <Badge key={m} tone={ctx.modules[m] ? "green" : "slate"}>
                    {MODULE_LABELS[m].label}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
