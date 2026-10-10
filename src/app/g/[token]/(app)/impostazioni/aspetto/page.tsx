import { requireStaffPage } from "@/server/auth/require-staff";
import { assetUrl } from "@/lib/assets";
import { AppearanceForm } from "./appearance-form";

export const metadata = { title: "Aspetto" };

export default async function AppearancePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { tenant } = await requireStaffPage(token, { permission: "settings.manage" });
  return (
    <AppearanceForm
      token={token}
      name={tenant.displayName}
      branding={tenant.branding}
      logoUrl={assetUrl(tenant.branding.logoPath)}
      coverUrl={assetUrl(tenant.branding.coverPath)}
    />
  );
}
