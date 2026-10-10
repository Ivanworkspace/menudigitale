import Link from "next/link";
import { requireStaffPage } from "@/server/auth/require-staff";
import { loadStats, resolveRange } from "@/server/stats";
import { Card, CardHeader, PageHeader, Stat, Alert } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { BarList, ColumnChart } from "@/components/charts";
import { formatEuro } from "@/lib/format";
import { delta } from "@/domain/stats";
import { PAYMENT_LABELS, type PaymentMethod } from "@/domain/billing";
import { cn } from "@/lib/cn";
import { PrintStatsButton } from "./print-button";

export const metadata = { title: "Statistiche" };

const PRESETS = [
  ["oggi", "Oggi"],
  ["7g", "7 giorni"],
  ["30g", "30 giorni"],
  ["mese", "Mese"],
  ["anno", "Anno"],
] as const;

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = delta(cur, prev);
  if (d === null) return <span className="text-slate-400">n.d. rispetto al periodo precedente</span>;
  return (
    <span className={d >= 0 ? "text-emerald-700" : "text-red-700"}>
      {d >= 0 ? "▲" : "▼"} {Math.abs(d)}% vs periodo precedente
    </span>
  );
}

export default async function StatsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ periodo?: string; da?: string; a?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const ctx = await requireStaffPage(token, { permission: "revenue.view" });
  const advanced = ctx.modules.advanced_stats;
  const range = resolveRange(ctx.tenant.settings.timezone, sp);
  const s = await loadStats(ctx.tenant, range);
  const eur = (c: number) => formatEuro(c);
  const q = `da=${range.from}&a=${range.to}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiche"
        description={`${range.label} · ${new Date(range.from).toLocaleDateString("it-IT")} – ${new Date(range.to).toLocaleDateString("it-IT")}`}
        action={
          advanced ? (
            <div className="no-print flex flex-wrap gap-2">
              <a className={buttonClass("secondary", "sm")} href={`${ctx.basePath}/statistiche/export?${q}&tipo=giorni`}>CSV giornaliero</a>
              <a className={buttonClass("secondary", "sm")} href={`${ctx.basePath}/statistiche/export?${q}&tipo=prodotti`}>CSV prodotti</a>
              <PrintStatsButton />
            </div>
          ) : null
        }
      />
      <form className="no-print flex flex-wrap items-center gap-2">
        {PRESETS.map(([k, l]) => (
          <Link
            key={k}
            href={`?periodo=${k}`}
            className={cn("rounded-full px-3 py-1.5 text-sm font-medium ring-1", range.label === resolveRange(ctx.tenant.settings.timezone, { periodo: k }).label && !sp.da ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300")}
          >
            {l}
          </Link>
        ))}
        <input type="date" name="da" defaultValue={range.from} className="h-9 rounded-lg px-2 text-sm ring-1 ring-slate-300" />
        <input type="date" name="a" defaultValue={range.to} className="h-9 rounded-lg px-2 text-sm ring-1 ring-slate-300" />
        <button className={buttonClass("secondary", "sm")}>Applica</button>
      </form>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Incassi" value={eur(s.summary.revenueCents)} hint={<Delta cur={s.summary.revenueCents} prev={s.previous.revenueCents} />} />
        <Stat label="Scontrino medio" value={eur(s.summary.avgTicketCents)} hint={<Delta cur={s.summary.avgTicketCents} prev={s.previous.avgTicketCents} />} />
        <Stat label="Coperti" value={s.summary.covers} hint={<Delta cur={s.summary.covers} prev={s.previous.covers} />} />
        <Stat label="Ordini / conti" value={`${s.orders} / ${s.summary.bills}`} hint={`Medio a coperto ${eur(s.summary.avgPerCoverCents)}`} />
      </div>

      <Card>
        <CardHeader title="Incassi per giorno" />
        <div className="p-5">
          <ColumnChart
            label="Incassi per giorno"
            data={s.daily.map((d) => ({ label: d.day.slice(8, 10), tooltip: new Date(d.day).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }), value: d.cents }))}
            format="euroShort"
          />
        </div>
      </Card>

      {!advanced ? (
        <Alert tone="info" title="Statistiche avanzate">
          Prodotti più e meno venduti, categorie, fasce orarie, camerieri, tavoli, scansioni QR ed esportazioni sono disponibili con il modulo Statistiche avanzate.
        </Alert>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Card>
              <CardHeader title="Fasce orarie" description="Incassi per ora di chiusura del conto" />
              <div className="p-5">
                <ColumnChart
                  label="Incassi per fascia oraria"
                  data={s.hourly.filter((h) => h.hour >= 6 || h.cents > 0).map((h) => ({ label: String(h.hour), tooltip: `${h.hour}:00–${h.hour + 1}:00 · ${h.bills} conti`, value: h.cents }))}
                  format="euroShort"
                  height={200}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Vendite per categoria" />
              <div className="p-5">
                <BarList data={s.categories.map((c) => ({ label: c.name, value: c.cents, sub: `${c.qty} pz` }))} format="euro" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Prodotti più venduti" />
              <div className="p-5">
                <BarList data={s.products.map((p) => ({ label: p.name, value: p.qty, sub: eur(p.cents) }))} format="pieces" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Prodotti meno venduti" description="Inclusi quelli mai ordinati nel periodo" />
              <ul className="divide-y divide-slate-100 text-sm">
                {[...s.unsold.map((p) => ({ name: p.name, qty: 0 })), ...[...s.products].reverse().map((p) => ({ name: p.name, qty: p.qty }))].slice(0, 10).map((p, i) => (
                  <li key={i} className="flex justify-between px-5 py-2">
                    <span>{p.name}</span>
                    <span className="tabular-nums text-slate-500">{p.qty} pz</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Camerieri" />
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Nome</th>
                    <th className="py-2 text-right font-medium">Tavoli</th>
                    <th className="py-2 text-right font-medium">Coperti</th>
                    <th className="py-2 text-right font-medium">Ordini</th>
                    <th className="px-5 py-2 text-right font-medium">Incasso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.waiters.map((w) => (
                    <tr key={w.name}>
                      <td className="px-5 py-2">{w.name}</td>
                      <td className="py-2 text-right tabular-nums">{w.tables}</td>
                      <td className="py-2 text-right tabular-nums">{w.covers}</td>
                      <td className="py-2 text-right tabular-nums">{w.orders}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{eur(w.revenueCents)}</td>
                    </tr>
                  ))}
                  {!s.waiters.length && (
                    <tr><td colSpan={5} className="px-5 py-6 text-center text-slate-500">Nessun dato.</td></tr>
                  )}
                </tbody>
              </table>
            </Card>
            <Card>
              <CardHeader title="Tavoli" description="Rotazione e permanenza media" />
              <ul className="divide-y divide-slate-100 text-sm">
                {s.tables.slice(0, 12).map((t) => (
                  <li key={t.label} className="flex justify-between px-5 py-2">
                    <span>Tavolo {t.label}</span>
                    <span className="tabular-nums text-slate-500">{t.turns} turni · {t.avgMinutes} min medi</span>
                  </li>
                ))}
                {!s.tables.length && <li className="px-5 py-6 text-center text-slate-500">Nessun dato.</li>}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Metodi di pagamento" />
              <div className="p-5">
                <BarList data={s.payments.map((p) => ({ label: PAYMENT_LABELS[p.method as PaymentMethod] ?? p.method, value: p.cents }))} format="euro" />
              </div>
            </Card>
            <Card>
              <CardHeader title="Menu digitale" description={`${s.menuViews} visite al menu · ${s.qrScans} scansioni QR dei tavoli`} />
              <div className="p-5">
                <p className="mb-3 text-sm font-medium">Prodotti più visti</p>
                <BarList data={s.productViews.map((p) => ({ label: p.name, value: p.views }))} format="count" />
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
