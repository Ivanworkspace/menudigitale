import { redirect } from "next/navigation";
import { resolveTenantByToken } from "@/server/tenancy/resolve";
import { getStaffContext, listActiveStaff } from "@/server/auth/staff-session";
import { assetUrl } from "@/lib/assets";
import { StaffLogin } from "./staff-login";

export const metadata = { title: "Accesso personale" };

export default async function StaffLoginPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (await getStaffContext(token)) redirect(`/g/${token}/dashboard`);
  const tenant = (await resolveTenantByToken(token))!;
  const staff = (await listActiveStaff(tenant.id)).map((s) => ({ id: s.id, displayName: s.displayName, role: s.role, color: s.color }));
  return <StaffLogin token={token} name={tenant.displayName} logoUrl={assetUrl(tenant.branding.logoPath)} staff={staff} />;
}
