import { requireStaffPage } from "@/server/auth/require-staff";
import { DEFAULT_LOYALTY } from "@/domain/loyalty";
import { LoyaltyForm } from "./loyalty-form";

export const metadata = { title: "Programma fedeltà" };

export default async function LoyaltyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await requireStaffPage(token, { module: "loyalty", permission: "customers.manage" });
  return <LoyaltyForm token={token} initial={ctx.tenant.settings.loyalty ?? DEFAULT_LOYALTY} />;
}
