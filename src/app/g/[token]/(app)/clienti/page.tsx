import Link from "next/link";
import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import type { Customer } from "@/server/customers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatEuro, formatRelative } from "@/lib/format";
import { NewCustomerButton } from "./customer-form";

export const metadata = { title: "Clienti" };

export default async function CustomersPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ q?: string }> }) {
  const { token } = await params;
  const { q = "" } = await searchParams;
  const ctx = await requireStaffPage(token, { module: "loyalty", permission: "customers.manage" });
  const needle = q.trim().toLowerCase();
  const key = /^\+?\d[\d\s]{4,}$/.test(needle) ? needle.replace(/\D/g, "").slice(-6) : needle.slice(0, 12);
  const list = needle.length >= 2
    ? await refs.customers(ctx.tenant.id).where("searchKeys", "array-contains", key).limit(50).get().then(allWithId<Customer>)
    : await refs.customers(ctx.tenant.id).orderBy("createdAt", "desc").limit(50).get().then(allWithId<Customer>);
  const mode = ctx.tenant.settings.loyalty?.mode ?? "points";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex-1">
          <input name="q" defaultValue={q} placeholder="Cerca per nome, telefono o email" className="h-10 w-full max-w-md rounded-lg bg-white px-3 text-sm ring-1 ring-slate-300" />
        </form>
        <NewCustomerButton token={token} basePath={ctx.basePath} />
      </div>
      <Card className="divide-y divide-slate-100">
        {list.map((c) => (
          <Link key={c.id} href={`${ctx.basePath}/clienti/${c.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="text-xs text-slate-500">
                {[c.phone, c.email].filter(Boolean).join(" · ")} {c.marketingConsent && <Badge tone="green">Marketing ✓</Badge>}
              </p>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold">{mode === "points" ? `${c.points} punti` : `${c.stamps} timbri`}</p>
              <p className="text-xs text-slate-500">{c.visits} visite · {formatEuro(c.totalSpentCents)} · {formatRelative(c.lastVisitAt)}</p>
            </div>
          </Link>
        ))}
        {!list.length && <p className="px-5 py-10 text-center text-sm text-slate-500">Nessun cliente.</p>}
      </Card>
    </div>
  );
}
