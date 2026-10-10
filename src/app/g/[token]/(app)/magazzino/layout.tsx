import { requireStaffPage } from "@/server/auth/require-staff";
import { PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/staff/tabs";

export default async function InventoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "inventory", permission: "inventory.manage" });
  const base = `${ctx.basePath}/magazzino`;
  return (
    <>
      <PageHeader title="Magazzino" description="Le vendite scaricano automaticamente gli ingredienti secondo le ricette" />
      <Tabs items={[{ href: base, label: "Scorte", exact: true }, { href: `${base}/ricette`, label: "Ricette" }, { href: `${base}/movimenti`, label: "Movimenti" }]} />
      {children}
    </>
  );
}
