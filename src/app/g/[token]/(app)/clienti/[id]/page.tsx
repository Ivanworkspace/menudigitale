import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, withId, allWithId } from "@/server/db";
import type { Customer } from "@/server/customers";
import type { Bill } from "@/server/billing/service";
import { DEFAULT_LOYALTY } from "@/domain/loyalty";
import { CustomerDetail } from "./customer-detail";

export const metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const ctx = await requireStaffPage(token, { module: "loyalty", permission: "customers.manage" });
  const c = withId<Customer>(await refs.customers(ctx.tenant.id).doc(id).get());
  if (!c) notFound();
  const [bills, tx] = await Promise.all([
    refs.bills(ctx.tenant.id).where("customerId", "==", id).limit(50).get().then(allWithId<Bill>),
    refs.loyaltyTransactions(ctx.tenant.id).where("customerId", "==", id).limit(50).get(),
  ]);
  return (
    <CustomerDetail
      token={token}
      basePath={ctx.basePath}
      customer={c}
      loyalty={ctx.tenant.settings.loyalty ?? DEFAULT_LOYALTY}
      bills={bills
        .filter((b) => b.status === "paid")
        .map((b) => ({ id: b.id, date: b.closedAt ?? b.createdAt, table: b.tableLabel, total: b.totals.totalCents }))
        .sort((a, b) => b.date.localeCompare(a.date))}
      transactions={tx.docs
        .map((d) => ({ id: d.id, at: d.get("at") as string, points: d.get("points") as number, stamps: d.get("stamps") as number, note: (d.get("note") as string | null) ?? null, kind: d.get("kind") as string }))
        .sort((a, b) => b.at.localeCompare(a.at))}
    />
  );
}
