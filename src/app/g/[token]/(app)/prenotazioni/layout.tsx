import { requireStaffPage } from "@/server/auth/require-staff";
import { PageHeader } from "@/components/ui/card";
import { Tabs } from "@/components/staff/tabs";

export default async function ReservationsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "reservations", permission: "reservations.manage" });
  const base = `${ctx.basePath}/prenotazioni`;
  return (
    <>
      <PageHeader title="Prenotazioni" />
      <Tabs
        items={[
          { href: base, label: "Calendario", exact: true },
          ...(ctx.permissions.has("settings.manage") ? [{ href: `${base}/impostazioni`, label: "Prenotazione online" }] : []),
        ]}
      />
      {children}
    </>
  );
}
