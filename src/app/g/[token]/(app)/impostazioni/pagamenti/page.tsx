import { requireStaffPage } from "@/server/auth/require-staff";
import { PaymentsForm } from "./payments-form";

export const metadata = { title: "Pagamenti" };

export default async function PaymentsSettingsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { permission: "settings.manage", module: "billing" });
  return <PaymentsForm token={token} methods={ctx.tenant.settings.paymentMethods ?? ["cash", "card", "satispay"]} />;
}
