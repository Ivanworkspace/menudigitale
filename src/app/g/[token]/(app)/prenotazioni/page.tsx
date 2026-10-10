import { requireStaffPage } from "@/server/auth/require-staff";
import { refs, allWithId } from "@/server/db";
import { reservationsOn, venueNow, whatsappLink } from "@/server/reservations";
import type { Table } from "@/domain/orders";
import { ReservationsDay } from "./reservations-day";

export const metadata = { title: "Prenotazioni" };

export default async function ReservationsPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ giorno?: string }> }) {
  const { token } = await params;
  const { giorno } = await searchParams;
  const ctx = await requireStaffPage(token, { module: "reservations", permission: "reservations.manage" });
  const today = venueNow(ctx.tenant).date;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(giorno ?? "") ? giorno! : today;
  const [list, tables] = await Promise.all([reservationsOn(ctx.tenant.id, date), refs.tables(ctx.tenant.id).get().then(allWithId<Table>)]);
  return (
    <ReservationsDay
      token={token}
      date={date}
      today={today}
      reservations={list
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((r) => ({
          ...r,
          whatsapp: whatsappLink(r.phone, `Ciao ${r.name}, ti confermiamo la prenotazione da ${ctx.tenant.displayName} per ${r.covers} persone alle ${r.time}. A presto!`),
        }))}
      tables={tables.filter((t) => t.active).map((t) => ({ id: t.id, label: t.label })).sort((a, b) => a.label.localeCompare(b.label, "it", { numeric: true }))}
      publicUrl={`/m/${ctx.tenant.slug}/prenota`}
      online={!!ctx.tenant.settings.reservations?.onlineEnabled}
    />
  );
}
