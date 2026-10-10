import { requireStaffPage } from "@/server/auth/require-staff";
import { PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/staff/tabs";

export default async function CustomersLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "loyalty", permission: "customers.manage" });
  const base = `${ctx.basePath}/clienti`;
  return (
    <>
      <PageHeader title="Clienti e fidelity" />
      <Tabs items={[{ href: base, label: "Clienti", exact: true }, { href: `${base}/fidelity`, label: "Programma fedeltà" }, { href: `${base}/promozioni`, label: "Promozioni e codici" }]} />
      {children}
    </>
  );
}
