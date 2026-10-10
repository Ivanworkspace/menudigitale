import Link from "next/link";
import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import type { AuditEntry } from "@/server/db/types";
import { Card, PageHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Registro attività" };
const PAGE = 60;

const LABELS: Record<string, string> = {
  "auth.login": "Accesso",
  "auth.logout": "Uscita",
  "product.price_changed": "Prezzo modificato",
  "product.created": "Prodotto creato",
  "product.updated": "Prodotto modificato",
  "product.deleted": "Prodotto eliminato",
  "product.sold_out": "Prodotto esaurito",
  "product.available": "Prodotto disponibile",
  "order.item_cancelled": "Prodotto annullato",
  "order.approved": "Ordine approvato",
  "order.rejected": "Ordine rifiutato",
  "bill.discount_applied": "Sconto applicato",
  "bill.payment_removed": "Pagamento annullato",
  "bill.closed": "Conto chiuso",
  "table.opened": "Tavolo aperto",
  "table.closed": "Tavolo chiuso",
  "impersonation.started": "Accesso assistenza",
};

export default async function AuditPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ prima?: string; tipo?: string }> }) {
  const { token } = await params;
  const { prima, tipo } = await searchParams;
  const ctx = await requireStaffPage(token, { permission: "audit.view" });
  let q = refs.audit(ctx.tenant.id).orderBy("createdAt", "desc");
  if (prima) q = q.where("createdAt", "<", prima);
  const rows = (await q.limit(PAGE * 3).get().then(allWithId<AuditEntry>)).filter((r) => !tipo || r.action.startsWith(tipo)).slice(0, PAGE);
  const filters = [["", "Tutto"], ["product.", "Menu e prezzi"], ["order.", "Ordini"], ["bill.", "Conti"], ["table.", "Tavoli"], ["auth.", "Accessi"], ["staff.", "Personale"], ["settings.", "Impostazioni"]];
  return (
    <>
      <PageHeader title="Registro attività" description="Chi ha fatto cosa e quando. Include lo storico delle modifiche a prezzi e prodotti." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {filters.map(([k, l]) => (
          <Link key={k} href={k ? `?tipo=${k}` : "?"} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${(tipo ?? "") === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white ring-slate-300"}`}>
            {l}
          </Link>
        ))}
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Chi</th>
                <th className="px-4 py-3 font-medium">Cosa</th>
                <th className="px-4 py-3 font-medium">Dettagli</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2 tabular-nums text-slate-600">{formatDateTime(r.createdAt)}</td>
                  <td className="px-4 py-2">{r.actorName ?? r.actorKind}</td>
                  <td className="px-4 py-2 font-medium">{LABELS[r.action] ?? r.action}</td>
                  <td className="max-w-md truncate px-4 py-2 font-mono text-xs text-slate-500" title={r.diff ? JSON.stringify(r.diff) : ""}>
                    {r.diff ? JSON.stringify(r.diff) : ""}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Nessuna attività.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {rows.length === PAGE && (
        <div className="mt-4 text-right">
          <Link href={`?prima=${encodeURIComponent(rows[rows.length - 1].createdAt)}${tipo ? `&tipo=${tipo}` : ""}`} className="text-sm text-slate-600 hover:underline">Meno recenti →</Link>
        </div>
      )}
    </>
  );
}
