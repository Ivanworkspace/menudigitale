import Link from "next/link";
import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import { listActiveStaff } from "@/server/auth/staff-session";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { formatEuro } from "@/lib/format";
import { tr } from "@/domain/menu";
import { averagePrepMinutes } from "@/domain/kds";
import { ITEM_STATUS_LABELS, orderProgress, type Order } from "@/domain/orders";
import { cn } from "@/lib/cn";
import { placeLabel, shortPlaceLabel } from "@/domain/takeaway";

export const metadata = { title: "Storico comande" };

/** Day boundaries in Europe/Rome as UTC ISO strings. */
function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00+01:00`);
  const end = new Date(start.getTime() + 26 * 3600_000); // generous: DST-safe, filtered below
  return { start: new Date(start.getTime() - 3600_000).toISOString(), end: end.toISOString() };
}

export default async function OrdersHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ giorno?: string; tavolo?: string; operatore?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const ctx = await requireStaffPage(token, { module: "orders", permission: "orders.create" });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.giorno ?? "") ? sp.giorno! : today;
  const { start, end } = dayRange(day);
  const [all, staff] = await Promise.all([
    refs.orders(ctx.tenant.id).where("createdAt", ">=", start).where("createdAt", "<", end).orderBy("createdAt", "desc").limit(500).get().then(allWithId<Order>),
    listActiveStaff(ctx.tenant.id),
  ]);
  const fmtDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" });
  const orders = all.filter(
    (o) =>
      fmtDay.format(new Date(o.createdAt)) === day &&
      (!sp.tavolo || o.tableLabel.split("+").includes(sp.tavolo)) &&
      (!sp.operatore || (sp.operatore === "qr" ? o.source === "qr" : o.createdBy === sp.operatore)),
  );
  const prep = averagePrepMinutes(orders as never).sort((a, b) => b.avgMinutes - a.avgMinutes);
  const cancelled = orders.flatMap((o) => o.items.filter((i) => i.status === "cancelled").map((i) => ({ o, i })));

  return (
    <>
      <PageHeader title="Storico comande" description={`${orders.length} comande`} action={<Link href={`${ctx.basePath}/ordini`} className={buttonClass("secondary")}>← Ordini</Link>} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Giorno
          <input type="date" name="giorno" defaultValue={day} className="ml-2 h-10 rounded-lg px-2 ring-1 ring-slate-300" />
        </label>
        <input name="tavolo" defaultValue={sp.tavolo} placeholder="Tavolo" className="h-10 w-24 rounded-lg px-2 ring-1 ring-slate-300" />
        <select name="operatore" defaultValue={sp.operatore ?? ""} className="h-10 rounded-lg px-2 ring-1 ring-slate-300">
          <option value="">Tutti gli operatori</option>
          <option value="qr">📱 Clienti (QR)</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.displayName}</option>
          ))}
        </select>
        <button className={buttonClass()}>Filtra</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {orders.map((o) => (
            <Card key={o.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {placeLabel(o.tableLabel)} · {new Date(o.createdAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {o.source === "qr" ? "📱 QR" : `👤 ${o.createdByName}`}
                  <Badge tone={o.status === "sent" ? "sky" : o.status === "pending_approval" ? "amber" : "red"}>{o.status === "sent" ? orderProgress(o) : o.status}</Badge>
                  <span className="font-semibold tabular-nums text-slate-800">{formatEuro(o.totalCents)}</span>
                </span>
              </div>
              <ul className="mt-2 text-sm">
                {o.items.map((i) => (
                  <li key={i.id} className={cn("flex justify-between", i.status === "cancelled" && "text-red-600")}>
                    <span className={cn(i.status === "cancelled" && "line-through")}>
                      {i.qty}× {tr(i.name, "it")}
                      {i.modifiers.length > 0 && <span className="text-xs text-slate-500"> ({i.modifiers.map((m) => tr(m.name, "it")).join(", ")})</span>}
                    </span>
                    <span className="text-xs text-slate-500">
                      {ITEM_STATUS_LABELS[i.status]}
                      {i.status === "cancelled" && i.cancelReason ? ` · ${i.cancelReason} (${i.cancelledBy ?? ""})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {orders.length === 0 && <Card className="px-5 py-10 text-center text-sm text-slate-500">Nessuna comanda per i filtri scelti.</Card>}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Tempo medio di preparazione" description="Dall'invio alla cucina al «pronto»" />
            <ul className="divide-y divide-slate-100 text-sm">
              {prep.slice(0, 20).map((p) => (
                <li key={p.productId} className="flex justify-between px-5 py-2">
                  <span>{p.name}</span>
                  <span className="tabular-nums text-slate-600">{p.avgMinutes.toFixed(1)} min · {p.count} pz</span>
                </li>
              ))}
              {prep.length === 0 && <li className="px-5 py-6 text-center text-slate-500">Nessun dato.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title={`Annullamenti (${cancelled.length})`} />
            <ul className="divide-y divide-slate-100 text-sm">
              {cancelled.map(({ o, i }) => (
                <li key={i.id} className="px-5 py-2">
                  <p>
                    {shortPlaceLabel(o.tableLabel)} · {i.qty}× {tr(i.name, "it")}
                  </p>
                  <p className="text-xs text-slate-500">
                    {i.cancelReason} · {i.cancelledBy}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
