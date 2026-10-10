import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import { openBill, type Bill } from "@/server/billing/service";
import { Alert, Card, CardHeader, PageHeader, Stat } from "@/components/ui/card";
import { formatEuro } from "@/lib/format";
import { FISCAL_WARNING, PAYMENT_LABELS, type PaymentMethod } from "@/domain/billing";
import type { TableSession } from "@/domain/orders";
import { BillView } from "./bill-view";
import { OpenTables } from "./open-tables";

export const metadata = { title: "Conti e cassa" };


export default async function BillsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ sessione?: string }> }) {
  const { token } = await params;
  const { sessione } = await searchParams;
  const ctx = await requireStaffPage(token, { module: "billing", permission: "bills.manage" });

  if (sessione) {
    const bill = await openBill(ctx.tenant, sessione);
    return (
      <BillView
        token={token}
        basePath={ctx.basePath}
        initial={bill}
        methods={(ctx.tenant.settings.paymentMethods as PaymentMethod[] | undefined) ?? ["cash", "card", "satispay"]}
        canDiscount={ctx.permissions.has("discounts.apply")}
        loyalty={ctx.modules.loyalty}
        warning={FISCAL_WARNING}
      />
    );
  }

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.tenant.settings.timezone }).format(new Date());
  const [sessions, closed] = await Promise.all([
    refs.tableSessions(ctx.tenant.id).where("status", "in", ["open", "bill_requested"]).get().then(allWithId<TableSession>),
    refs.bills(ctx.tenant.id).where("businessDay", "==", day).get().then(allWithId<Bill & { businessDay: string }>),
  ]);
  const paid = closed.filter((b) => b.status === "paid").sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
  const byMethod = new Map<string, number>();
  for (const b of paid) for (const p of b.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amountCents);
  const total = paid.reduce((s, b) => s + b.totals.totalCents, 0);
  const covers = paid.reduce((s, b) => s + b.covers + b.coversChildren, 0);

  return (
    <>
      <PageHeader title="Conti e cassa" description="Scegli un tavolo per preparare il conto" />
      <div className="mb-4"><Alert tone="warning">{FISCAL_WARNING}</Alert></div>
      <OpenTables basePath={ctx.basePath} initial={sessions} />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Incasso di oggi" value={formatEuro(total)} hint={`${paid.length} conti chiusi`} />
        <Stat label="Coperti" value={covers} />
        <Stat label="Scontrino medio" value={formatEuro(paid.length ? Math.round(total / paid.length) : 0)} />
        <Stat label="Medio a coperto" value={formatEuro(covers ? Math.round(total / covers) : 0)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Per metodo di pagamento" />
          <ul className="divide-y divide-slate-100 text-sm">
            {[...byMethod.entries()].map(([m, c]) => (
              <li key={m} className="flex justify-between px-5 py-2.5">
                <span>{PAYMENT_LABELS[m as PaymentMethod] ?? m}</span>
                <span className="font-semibold tabular-nums">{formatEuro(c)}</span>
              </li>
            ))}
            {!byMethod.size && <li className="px-5 py-6 text-center text-slate-500">Nessun incasso.</li>}
          </ul>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Conti chiusi oggi" />
          <ul className="divide-y divide-slate-100 text-sm">
            {paid.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-5 py-2.5">
                <span>
                  <strong>#{b.number}</strong> · Tavolo {b.tableLabel} · {b.covers + b.coversChildren} cop. ·{" "}
                  {b.closedAt && new Date(b.closedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex items-center gap-3">
                  <a href={`${ctx.basePath}/conti/${b.id}/stampa`} target="_blank" className="text-xs text-slate-500 hover:underline">Ristampa</a>
                  <span className="font-semibold tabular-nums">{formatEuro(b.totals.totalCents)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
