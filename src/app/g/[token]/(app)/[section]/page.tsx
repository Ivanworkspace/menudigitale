import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/require-staff";
import { NAV_ITEMS } from "@/domain/permissions";
import { Card, PageHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

// Sections not yet implemented; each later phase adds a dedicated route that
// takes precedence over this placeholder.
const PHASE: Record<string, number> = {
  sala: 3, ordini: 3, cucina: 4, conti: 5, menu: 2, prenotazioni: 7, clienti: 7,
  magazzino: 7, statistiche: 6, personale: 6, registro: 6, impostazioni: 2,
};

export default async function SectionPlaceholder({ params }: { params: Promise<{ token: string; section: string }> }) {
  const { token, section } = await params;
  const item = NAV_ITEMS.find((n) => n.href === section);
  if (!item) notFound();
  await requireStaffPage(token, { module: item.module, permission: item.permission });
  return (
    <>
      <PageHeader title={item.label} />
      <Card className="flex flex-col items-center px-6 py-16 text-center">
        <Icon name={item.icon} className="h-10 w-10 text-slate-300" />
        <p className="mt-4 font-medium text-slate-900">Sezione in arrivo</p>
        <p className="mt-1 text-sm text-slate-500">Disponibile con la fase {PHASE[section] ?? "successiva"} dello sviluppo.</p>
      </Card>
    </>
  );
}
