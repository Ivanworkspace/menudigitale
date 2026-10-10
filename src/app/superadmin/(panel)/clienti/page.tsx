import Link from "next/link";
import { listTenants } from "@/server/superadmin/queries";
import { Card, PageHeader } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PhaseBadge } from "@/components/superadmin/status-badge";
import { formatDate, formatRelative } from "@/lib/format";
import { PHASE_LABELS, type SubscriptionPhase } from "@/domain/subscription";
import { cn } from "@/lib/cn";

export const metadata = { title: "Clienti" };

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; stato?: string }> }) {
  const { q = "", stato = "" } = await searchParams;
  const all = await listTenants();
  const needle = q.trim().toLowerCase();
  const tenants = all.filter(
    (t) =>
      (!stato || t.sub.phase === stato) &&
      (!needle || [t.displayName, t.legalName, t.slug, t.city ?? ""].some((v) => v.toLowerCase().includes(needle))),
  );
  const filters: (SubscriptionPhase | "")[] = ["", "active", "trial", "grace", "expired", "suspended"];

  return (
    <>
      <PageHeader
        title="Clienti"
        description={`${all.length} locali registrati`}
        action={
          <Link href="/superadmin/clienti/nuovo" className={buttonClass()}>
            <Icon name="plus" className="h-4 w-4" /> Nuovo cliente
          </Link>
        }
      />
      <form className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cerca per nome, slug o città"
          className="h-10 w-full rounded-lg bg-white px-3 text-sm ring-1 ring-slate-300 sm:max-w-xs"
        />
        {stato && <input type="hidden" name="stato" value={stato} />}
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Link
              key={f || "all"}
              href={{ query: { ...(q ? { q } : {}), ...(f ? { stato: f } : {}) } }}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
                stato === f ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
              )}
            >
              {f ? PHASE_LABELS[f] : "Tutti"}
            </Link>
          ))}
        </div>
      </form>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Locale</th>
                <th className="px-4 py-3 font-medium">Stato</th>
                <th className="px-4 py-3 font-medium">Piano</th>
                <th className="px-4 py-3 font-medium">Scadenza</th>
                <th className="px-4 py-3 text-right font-medium">Ordini mese</th>
                <th className="px-4 py-3 font-medium">Ultimo accesso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/superadmin/clienti/${t.id}`} className="font-medium text-slate-900 hover:underline">
                      {t.displayName}
                    </Link>
                    <p className="text-xs text-slate-500">/m/{t.slug}{t.city ? ` · ${t.city}` : ""}</p>
                  </td>
                  <td className="px-4 py-3"><PhaseBadge phase={t.sub.phase} /></td>
                  <td className="px-4 py-3 text-slate-700">{t.planName ?? "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{formatDate(t.sub.endsAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{t.ordersThisMonth}</td>
                  <td className="px-4 py-3 text-slate-500">{formatRelative(t.lastActivityAt)}</td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Nessun cliente trovato.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
