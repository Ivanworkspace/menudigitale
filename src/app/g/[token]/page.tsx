import { redirect } from "next/navigation";
import { resolveTenantByToken } from "@/server/tenancy/resolve";
import { getStaffContext } from "@/server/auth/staff-session";
import { assetUrl } from "@/lib/assets";
import { OwnerLogin } from "./owner-login";

export default async function OwnerLoginPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (await getStaffContext(token)) redirect(`/g/${token}/dashboard`);
  const tenant = (await resolveTenantByToken(token))!;
  return <OwnerLogin token={token} name={tenant.displayName} logoUrl={assetUrl(tenant.branding.logoPath)} />;
}
