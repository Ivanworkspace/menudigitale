import { requireStaffPage } from "@/server/auth/require-staff";
import { PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/staff/tabs";

export default async function SettingsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "settings.manage" });
  const base = `${ctx.basePath}/impostazioni`;
  const tabs = [
    { href: base, label: "Locale e orari", exact: true },
    { href: `${base}/menu`, label: "Menu e lingue" },
    ...(ctx.modules.orders ? [{ href: `${base}/ordini`, label: "Ordini e AYCE" }] : []),
    { href: `${base}/aspetto`, label: "Aspetto" },
    { href: `${base}/reparti`, label: "Reparti" },
    { href: `${base}/stampanti`, label: "Stampanti" },
    ...(ctx.modules.billing ? [{ href: `${base}/pagamenti`, label: "Pagamenti" }] : []),
    { href: `${base}/legali`, label: "Testi legali" },
  ];
  return (
    <>
      <PageHeader title="Impostazioni" />
      <Tabs items={tabs} />
      {children}
    </>
  );
}
