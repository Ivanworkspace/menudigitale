import { redirect } from "next/navigation";
import { resolveTenantByToken } from "@/server/tenancy/resolve";
import { getStaffContext } from "@/server/auth/staff-session";
import { assetUrl } from "@/lib/assets";
import { OwnerLogin } from "./owner-login";

export default async function OwnerLoginPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ app?: string }> }) {
  const { token } = await params;
  const ownerApp = (await searchParams).app === "titolare";
  if (await getStaffContext(token)) redirect(`/g/${token}/${ownerApp ? "titolare" : "dashboard"}`);
  const tenant = (await resolveTenantByToken(token))!;
  return <OwnerLogin token={token} name={tenant.displayName} logoUrl={assetUrl(tenant.branding.logoPath)} ownerApp={ownerApp} />;
}
