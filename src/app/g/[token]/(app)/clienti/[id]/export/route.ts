import { NextResponse } from "next/server";
import { getStaffContext } from "@/server/auth/staff-session";
import { refs, allWithId } from "@/server/db";
import { logTenantAction } from "@/server/audit";

/** GDPR data portability: all data held about one customer, as JSON. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const ctx = await getStaffContext(token);
  if (!ctx || !ctx.permissions.has("customers.manage")) return new NextResponse("Non autorizzato", { status: 401 });
  const c = await refs.customers(ctx.tenant.id).doc(id).get();
  if (!c.exists) return new NextResponse("Non trovato", { status: 404 });
  const [bills, tx, reservations] = await Promise.all([
    refs.bills(ctx.tenant.id).where("customerId", "==", id).get().then(allWithId<Record<string, unknown>>),
    refs.loyaltyTransactions(ctx.tenant.id).where("customerId", "==", id).get().then(allWithId<Record<string, unknown>>),
    refs.reservations(ctx.tenant.id).where("customerId", "==", id).get().then(allWithId<Record<string, unknown>>),
  ]);
  const { searchKeys: _s, ...customer } = c.data()!;
  void _s;
  await logTenantAction(ctx.tenant.id, { kind: "staff", id: ctx.staff.id, name: ctx.staff.displayName }, "customer.exported", { entity: "customer", entityId: id });
  const body = JSON.stringify(
    {
      titolare: ctx.tenant.legalName,
      esportatoIl: new Date().toISOString(),
      cliente: customer,
      visite: bills.map((b) => ({ data: b.closedAt, tavolo: b.tableLabel, totale: (b.totals as { totalCents: number }).totalCents / 100 })),
      fedelta: tx,
      prenotazioni: reservations,
    },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="cliente-${id}.json"` },
  });
}
