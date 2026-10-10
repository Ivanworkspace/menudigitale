import { requireStaffPage } from "@/server/auth/require-staff";
import { refs } from "@/server/db";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Movimenti di magazzino" };
const REASON: Record<string, string> = { sale: "Vendita", cancel: "Annullo (rientro)", load: "Carico", waste: "Scarico / scarto", inventory: "Inventario" };

export default async function MovementsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "inventory", permission: "inventory.manage" });
  const snap = await refs.stockMovements(ctx.tenant.id).orderBy("at", "desc").limit(200).get();
  return (
    <Card className="overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr><th className="px-4 py-2">Quando</th><th className="px-4 py-2">Ingrediente</th><th className="px-4 py-2">Causale</th><th className="px-4 py-2 text-right">Quantità</th><th className="px-4 py-2">Chi / Nota</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {snap.docs.map((d) => {
            const m = d.data();
            return (
              <tr key={d.id}>
                <td className="whitespace-nowrap px-4 py-2 text-slate-600">{formatDateTime(m.at)}</td>
                <td className="px-4 py-2">{m.ingredientName}</td>
                <td className="px-4 py-2">{REASON[m.reason] ?? m.reason}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${m.delta < 0 ? "text-red-600" : "text-emerald-700"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                <td className="px-4 py-2 text-slate-500">{[m.by, m.note].filter(Boolean).join(" · ")}</td>
              </tr>
            );
          })}
          {snap.empty && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Nessun movimento.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}
