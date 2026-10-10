import { NextResponse, type NextRequest } from "next/server";
import { getStaffContext } from "@/server/auth/staff-session";
import { loadStats, resolveRange } from "@/server/stats";
import { toCsv } from "@/domain/csv";

/** CSV exports (open in Excel): ?da&a&tipo=giorni|prodotti|camerieri */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getStaffContext(token);
  if (!ctx || !ctx.permissions.has("revenue.view") || !ctx.modules.advanced_stats) return new NextResponse("Non autorizzato", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const range = resolveRange(ctx.tenant.settings.timezone, { da: sp.get("da") ?? undefined, a: sp.get("a") ?? undefined });
  const s = await loadStats(ctx.tenant, range);
  const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const tipo = sp.get("tipo");
  const rows =
    tipo === "prodotti"
      ? [["Prodotto", "Quantità", "Incasso €"], ...s.products.map((p) => [p.name, p.qty, eur(p.cents)])]
      : tipo === "camerieri"
        ? [["Cameriere", "Tavoli", "Coperti", "Ordini", "Incasso €"], ...s.waiters.map((w) => [w.name, w.tables, w.covers, w.orders, eur(w.revenueCents)])]
        : [["Giorno", "Incasso €"], ...s.daily.map((d) => [d.day, eur(d.cents)])];
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="statistiche-${tipo ?? "giorni"}-${range.from}_${range.to}.csv"`,
    },
  });
}
