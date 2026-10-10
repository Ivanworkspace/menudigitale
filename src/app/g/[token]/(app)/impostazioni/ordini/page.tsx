import { requireStaffPage } from "@/server/auth/require-staff";
import { DEFAULT_AYCE } from "@/domain/ayce";
import { OrderSettingsForm } from "./order-settings-form";

export const metadata = { title: "Ordini e AYCE" };

export default async function OrderSettingsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { tenant } = await requireStaffPage(token, { permission: "settings.manage", module: "orders" });
  return (
    <OrderSettingsForm
      token={token}
      protection={tenant.settings.orderProtection}
      ayce={tenant.settings.ayce ?? DEFAULT_AYCE}
      hasLocation={tenant.lat != null && tenant.lng != null}
      radius={tenant.geofenceRadiusM}
    />
  );
}
