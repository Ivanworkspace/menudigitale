import type { Metadata } from "next";
import Link from "next/link";
import { requireStaffPage } from "@/server/auth/require-staff";
import { ownerSnapshot } from "@/server/owner";
import { pushConfigured } from "@/server/push";
import { formatEuro as eur } from "@/lib/format";
import { deltaLabel } from "@/domain/push";
import { cn } from "@/lib/cn";
import { AutoRefresh } from "@/components/public/auto-refresh";
import { PushSettings } from "./push-settings";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "App titolare",
    manifest: `/g/${token}/manifest.webmanifest?app=titolare`,
    appleWebApp: { capable: true, title: "Titolare", statusBarStyle: "black-translucent" },
  };
}

const WEEKDAY = new Intl.DateTimeFormat("it-IT", { weekday: "short", timeZone: "UTC" });

function Delta({ now, before }: { now: number; before: number }) {
  const d = deltaLabel(now, before);
  if (!d) return null;
  const up = now >= before;
  return <span className={cn("text-xs font-semibold", up ? "text-emerald-600" : "text-red-600")}>{up ? "▲" : "▼"} {d}</span>;
}

function Tile({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "warn" }) {
  const body = (
    <div className={cn("h-full rounded-2xl bg-white p-4 shadow-sm ring-1", tone === "warn" ? "ring-2 ring-amber-300" : "ring-slate-200")}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function OwnerAppPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "revenue.view" });
  const s = await ownerSnapshot(ctx.tenant);
  const base = ctx.basePath;
  const max = Math.max(1, ...s.last7.map((d) => d.revenueCents));
  const week = s.last7.reduce((n, d) => n + d.revenueCents, 0);
  const avg = s.now.bills ? Math.round(s.now.revenueCents / s.now.bills) : 0;
  const alerts = [
    s.pendingOrders > 0 && { text: `${s.pendingOrders} ordin${s.pendingOrders === 1 ? "e" : "i"} da confermare`, href: `${base}/ordini` },
    s.takeaway && s.takeaway.pending > 0 && { text: `${s.takeaway.pending} asport${s.takeaway.pending === 1 ? "o" : "i"} da confermare`, href: `${base}/asporto` },
    s.room.billRequested > 0 && { text: `${s.room.billRequested} tavol${s.room.billRequested === 1 ? "o chiede" : "i chiedono"} il conto`, href: `${base}/conti` },
    s.blocks > 0 && { text: `${s.blocks} tentativ${s.blocks === 1 ? "o" : "i"} d'ordine bloccat${s.blocks === 1 ? "o" : "i"} (da fuori locale o codice errato)`, href: `${base}/ordini` },
    s.lowStock.length > 0 && { text: `Scorte basse: ${s.lowStock.slice(0, 4).map((i) => i.name).join(", ")}${s.lowStock.length > 4 ? "…" : ""}`, href: `${base}/magazzino` },
    s.soldOut.length > 0 && { text: `Esauriti: ${s.soldOut.slice(0, 4).join(", ")}${s.soldOut.length > 4 ? "…" : ""}`, href: `${base}/disponibilita` },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <AutoRefresh seconds={30} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{ctx.tenant.displayName}</h1>
        <p className="text-sm text-slate-500">
          Oggi, {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: ctx.tenant.settings.timezone })} · si aggiorna da solo
        </p>
      </div>

      {s.billing && (
        <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-sm">
          <p className="text-sm text-slate-300">Incassato oggi</p>
          <p className="mt-1 text-4xl font-bold tabular-nums">{eur(s.now.revenueCents)}</p>
          <p className="mt-1 text-sm text-slate-300">
            {s.now.bills} cont{s.now.bills === 1 ? "o" : "i"} · {s.now.covers} copert{s.now.covers === 1 ? "o" : "i"} · scontrino medio {eur(avg)}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Stesso giorno della settimana scorsa: {eur(s.lastWeek.revenueCents)}{" "}
            {deltaLabel(s.now.revenueCents, s.lastWeek.revenueCents) && <span className="font-semibold text-white">({deltaLabel(s.now.revenueCents, s.lastWeek.revenueCents)})</span>}
          </p>
          {s.room.valueCents + (s.takeaway?.valueCents ?? 0) > 0 && (
            <p className="mt-1 text-xs text-slate-400">Ancora da incassare (tavoli aperti e asporto): {eur(s.room.valueCents + (s.takeaway?.valueCents ?? 0))}</p>
          )}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => (
            <Link key={a.text} href={a.href} className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
              <span>⚠️ {a.text}</span>
              <span aria-hidden>→</span>
            </Link>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Tavoli aperti" value={s.room.openTables} hint={`${s.room.covers} persone in sala`} href={`${base}/sala`} />
        <Tile label="Valore in sala" value={eur(s.room.valueCents)} hint="Ordini dei tavoli aperti" href={`${base}/conti`} />
        {s.takeaway && <Tile label="Asporto" value={s.takeaway.active + s.takeaway.pending} hint={`${s.takeaway.pending} da confermare`} href={`${base}/asporto`} tone={s.takeaway.pending ? "warn" : undefined} />}
        {s.reservations && <Tile label="Prenotazioni oggi" value={s.reservations.count} hint={`${s.reservations.covers} coperti`} href={`${base}/prenotazioni`} />}
      </div>

      {s.billing && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">Ultimi 7 giorni</p>
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{eur(week)}</span> <Delta now={week} before={s.prev7RevenueCents} />
            </p>
          </div>
          <div className="mt-4 flex h-32 items-end gap-2">
            {s.last7.map((d) => (
              <div key={d.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.day}: ${eur(d.revenueCents)}`}>
                <span className="text-[10px] tabular-nums text-slate-500">{d.revenueCents ? Math.round(d.revenueCents / 100) : ""}</span>
                <div className={cn("w-full rounded-t", d.day === s.today ? "bg-slate-900" : "bg-slate-300")} style={{ height: `${Math.max(2, (d.revenueCents / max) * 100)}%` }} />
                <span className="text-[11px] capitalize text-slate-500">{WEEKDAY.format(new Date(`${d.day}T12:00:00Z`))}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Importi in euro. Confronto con i 7 giorni precedenti.</p>
        </div>
      )}

      <PushSettings token={token} serverReady={pushConfigured()} vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} homePath={`${base}/titolare`} />

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Link href={`${base}/statistiche`} className="rounded-xl bg-white p-4 font-medium shadow-sm ring-1 ring-slate-200">📊 Statistiche complete</Link>
        <Link href={`${base}/conti`} className="rounded-xl bg-white p-4 font-medium shadow-sm ring-1 ring-slate-200">🧾 Conti di oggi</Link>
        <Link href={`${base}/disponibilita`} className="rounded-xl bg-white p-4 font-medium shadow-sm ring-1 ring-slate-200">✅ Prodotti esauriti</Link>
        <Link href={`${base}/registro`} className="rounded-xl bg-white p-4 font-medium shadow-sm ring-1 ring-slate-200">📋 Registro attività</Link>
      </div>
    </div>
  );
}
