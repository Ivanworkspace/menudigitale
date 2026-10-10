import { requireStaffPage } from "@/server/auth/require-staff";
import { reservationConfig } from "@/server/reservations";
import { publicEnv } from "@/lib/env";
import { ReservationSettingsForm } from "./settings-form";

export const metadata = { title: "Prenotazione online" };

export default async function ReservationSettingsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "reservations", permission: "settings.manage" });
  return <ReservationSettingsForm token={token} initial={reservationConfig(ctx.tenant)} url={`${publicEnv.appUrl}/m/${ctx.tenant.slug}/prenota`} />;
}
