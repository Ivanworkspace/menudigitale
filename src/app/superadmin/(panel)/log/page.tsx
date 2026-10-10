import Link from "next/link";
import { refs, allWithId } from "@/server/db";
import type { PlatformAuditEntry } from "@/server/db/types";
import { listTenants } from "@/server/superadmin/queries";
import { Card, PageHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Registro attività" };
const PAGE = 50;

export default async function LogPage({ searchParams }: { searchParams: Promise<{ prima?: string }> }) {
  const { prima } = await searchParams;
  let q = refs.platformAudit().orderBy("createdAt", "desc");
  if (prima) q = q.where("createdAt", "<", prima);
  const [rows, tenants, admins] = await Promise.all([
    q.limit(PAGE).get().then(allWithId<PlatformAuditEntry>),
    listTenants(),
    refs.platformAdmins().get(),
  ]);
  const tName = new Map(tenants.map((t) => [t.id, t.displayName]));
  const aName = new Map(admins.docs.map((a) => [a.id, a.get("displayName") as string]));

  return (
    <>
      <PageHeader title="Registro attività" description="Tutte le operazioni eseguite dagli amministratori" />
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Quando</th>
                <th className="px-4 py-3 font-medium">Chi</th>
                <th className="px-4 py-3 font-medium">Azione</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Dettagli</th>
                <th className="px-4 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-slate-600">{formatDateTime(r.createdAt)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{(r.adminId && aName.get(r.adminId)) ?? "—"}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{r.action}</td>
                  <td className="px-4 py-2.5">
                    {r.tenantId ? (
                      <Link className="hover:underline" href={`/superadmin/clienti/${r.tenantId}`}>
                        {tName.get(r.tenantId) ?? r.tenantId.slice(0, 8)}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 font-mono text-xs text-slate-500">
                    {Object.keys(r.payload ?? {}).length ? JSON.stringify(r.payload) : ""}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="mt-4 flex justify-between text-sm">
        {prima ? <Link href="?" className="text-slate-600 hover:underline">← Più recenti</Link> : <span />}
        {rows.length === PAGE && (
          <Link href={`?prima=${encodeURIComponent(rows[rows.length - 1].createdAt)}`} className="text-slate-600 hover:underline">
            Meno recenti →
          </Link>
        )}
      </div>
    </>
  );
}
